import uuid

from fastapi.testclient import TestClient

from app.main import app
from app.pipeline import process_job
from tests.conftest import make_token


def test_expenses_month_comparison_and_drilldown(conn, biz):
    client = TestClient(app)
    auth = {"Authorization": "Bearer " + make_token(conn, biz)}
    csv = (
        "Date,Category,Amount,Description\n"
        "2026-02-01,Rent,100,February rent\n"
        "2026-03-01,Rent,125,March rent\n"
        "2026-03-02,Rent,25,Extra rent\n"
        "2026-02-03,Utilities,80,Old bill\n"
        "2026-03-04,Advertising,20,New campaign\n"
        "2026-02-05,Zero,0,Previous zero\n"
        "2026-03-05,Zero,0,Current zero\n"
        "2026-04-01,Rent,999,Next month\n"
    )
    response = client.post(
        "/uploads", headers=auth,
        files={"file": ("expenses.csv", csv.encode(), "text/csv")},
        data={"upload_type": "expenses"},
    )
    assert response.status_code == 202
    result = process_job(conn, uuid.UUID(response.json()["job_id"]))
    assert result["status"] == "completed"
    response = client.get("/analytics/expenses", params={"month": "2026-03"}, headers=auth)
    assert response.status_code == 200
    payload = response.json()
    assert payload["previous_month"] == "2026-02"
    categories = {item["category"]: item for item in payload["categories"]}
    assert categories["rent"] == {"category": "rent", "total": 150.0, "previous_total": 100.0, "change_percent": 50.0}
    assert categories["utilities"]["total"] == 0
    assert categories["utilities"]["change_percent"] == -100
    assert categories["advertising"]["change_percent"] is None
    assert categories["zero"]["change_percent"] is None
    entries = client.get("/analytics/expenses/entries", params={"month": "2026-03", "category": "rent"}, headers=auth)
    assert entries.status_code == 200
    assert [(entry["date"], entry["amount"], entry["description"]) for entry in entries.json()["entries"]] == [
        ("2026-03-02", 25.0, "Extra rent"), ("2026-03-01", 125.0, "March rent")
    ]
    assert client.get("/analytics/expenses/entries", params={"month": "2026-03", "category": "utilities"}, headers=auth).json()["entries"] == []


def test_expenses_auth_validation_and_business_isolation(conn, biz):
    client = TestClient(app)
    auth = {"Authorization": "Bearer " + make_token(conn, biz)}
    params = {"month": "2026-01"}
    assert client.get("/analytics/expenses", params=params).status_code == 401
    assert client.get("/analytics/expenses/entries", params={**params, "category": "rent"}).status_code == 401
    assert client.get("/analytics/expenses", params=params, headers=auth).json() == {
        "month": "2026-01", "previous_month": "2025-12", "categories": []
    }
    for month in ("2026-13", "2026-2", "0001-01", "9999-12"):
        assert client.get("/analytics/expenses", params={"month": month}, headers=auth).status_code == 422
    cursor = conn.cursor()
    cursor.execute("INSERT INTO businesses(business_name) VALUES('expense-other') RETURNING business_id")
    other_auth = {"Authorization": "Bearer " + make_token(conn, cursor.fetchone()[0])}
    conn.commit()
    upload = client.post(
        "/uploads", headers=auth,
        files={"file": ("expenses.csv", b"Date,Category,Amount,Description\n2026-03-01,Rent,100,Private\n", "text/csv")},
        data={"upload_type": "expenses"},
    )
    assert upload.status_code == 202
    assert process_job(conn, uuid.UUID(upload.json()["job_id"]))["status"] == "completed"
    assert client.get("/analytics/expenses", params={"month": "2026-03"}, headers=other_auth).json()["categories"] == []
    assert client.get("/analytics/expenses/entries", params={"month": "2026-03", "category": "rent"}, headers=other_auth).json()["entries"] == []
