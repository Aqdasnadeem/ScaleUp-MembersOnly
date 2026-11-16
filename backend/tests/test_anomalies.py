import uuid

from fastapi.testclient import TestClient

from app.main import app
from app.pipeline import process_job
from tests.conftest import make_token


def upload(client, auth, conn, kind, contents):
    response = client.post(
        "/uploads", headers=auth,
        files={"file": (f"{kind}.csv", contents.encode(), "text/csv")},
        data={"upload_type": kind},
    )
    assert response.status_code == 202
    result = process_job(conn, uuid.UUID(response.json()["job_id"]))
    assert result["status"] == "completed", result


def test_anomalies_calculate_evidence_and_filter_by_type(conn, biz):
    client = TestClient(app)
    auth = {"Authorization": "Bearer " + make_token(biz)}
    upload(client, auth, conn, "sales", (
        "Order No,Date,SKU,Product,Qty,Unit Price\n"
        "A0,2026-02-24,P1,Pen,1,9999\n"
        "A1,2026-03-01,P1,Pen,1,100\n"
        "A2,2026-03-02,P1,Pen,1,100\n"
        "A3,2026-03-03,P1,Pen,1,100\n"
        "A4,2026-03-04,P1,Pen,1,150\n"
    ))
    upload(client, auth, conn, "expenses", (
        "Date,Category,Amount,Description\n"
        "2026-02-01,Rent,100,Previous rent\n"
        "2026-03-03,Rent,150,Current rent\n"
        "2026-02-02,Zero,0,Previous zero\n"
        "2026-03-03,Zero,100,Current positive\n"
    ))
    upload(client, auth, conn, "inventory", (
        "SKU,Product,Stock,Date\n"
        "P1,Pen,10,2026-02-01\n"
        "P1,Pen,5,2026-03-04\n"
        "P2,Book,0,2026-02-01\n"
        "P2,Book,20,2026-03-04\n"
        "P3,Mug,10,2026-02-01\n"
        "P3,Mug,6,2026-03-04\n"
    ))
    params = {"start_date": "2026-03-04", "end_date": "2026-03-04"}
    response = client.get("/analytics/anomalies", params=params, headers=auth)
    assert response.status_code == 200
    items = response.json()["anomalies"]
    assert {item["type"] for item in items} == {"sales", "inventory"}
    sales = next(item for item in items if item["type"] == "sales")
    assert sales["change_percent"] == 50
    assert sales["baseline"] == 100
    assert sales["evidence"] == [
        {"date": "2026-03-01", "value": 100},
        {"date": "2026-03-02", "value": 100},
        {"date": "2026-03-03", "value": 100},
        {"date": "2026-03-04", "value": 150},
    ]
    stock = next(item for item in items if item["type"] == "inventory")
    assert stock["change_percent"] == -50
    assert stock["evidence"] == [{"date": "2026-02-01", "value": 10}, {"date": "2026-03-04", "value": 5}]
    assert len(items) == 2
    assert [item["type"] for item in client.get("/analytics/anomalies", params={**params, "type": "sales"}, headers=auth).json()["anomalies"]] == ["sales"]

    expenses = client.get("/analytics/anomalies", params={
        "start_date": "2026-03-01", "end_date": "2026-03-04", "type": "expenses"
    }, headers=auth).json()["anomalies"]
    assert len(expenses) == 1
    assert expenses[0]["metric"] == "Monthly expenses: rent"
    assert expenses[0]["change_percent"] == 50
    assert expenses[0]["evidence"] == [{"date": "2026-02-01", "value": 100}, {"date": "2026-03-01", "value": 150}]


def test_anomalies_validate_dates_auth_and_isolate_business(conn, biz):
    client = TestClient(app)
    auth = {"Authorization": "Bearer " + make_token(biz)}
    params = {"start_date": "2026-03-01", "end_date": "2026-03-04"}
    assert client.get("/analytics/anomalies", params=params).status_code == 401
    assert client.get("/analytics/anomalies", params={**params, "type": "other"}, headers=auth).status_code == 422
    assert client.get("/analytics/anomalies", params={"start_date": "2026-03-04", "end_date": "2026-03-01"}, headers=auth).status_code == 422
    assert client.get("/analytics/anomalies", params={"start_date": "0001-01-01", "end_date": "2026-03-01"}, headers=auth).status_code == 422
    upload(client, auth, conn, "inventory", (
        "SKU,Product,Stock,Date\nP1,Pen,10,2026-03-01\nP1,Pen,5,2026-03-04\n"
    ))
    cursor = conn.cursor()
    cursor.execute("INSERT INTO businesses(business_name) VALUES('anomalies-other') RETURNING business_id")
    other_auth = {"Authorization": "Bearer " + make_token(cursor.fetchone()[0])}
    conn.commit()
    assert len(client.get("/analytics/anomalies", params=params, headers=auth).json()["anomalies"]) == 1
    assert client.get("/analytics/anomalies", params=params, headers=other_auth).json()["anomalies"] == []
