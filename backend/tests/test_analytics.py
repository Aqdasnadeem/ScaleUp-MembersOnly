import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.pipeline import process_job
from tests.conftest import make_token

SALES_CSV = (
    "Order No,Date,SKU,Product,Qty,Unit Price,Customer\n"
    "A1,2026-03-10,P1,Pen,2,10,C1\n"
    "A1,2026-03-10,P2,Cap,1,5,C1\n"
    "A2,2026-03-11,P1,Pen,1,10,C1\n"
    "A3,2026-03-12,P3,Mug,1,100,C2\n"
)


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def auth(biz):
    return {"Authorization": "Bearer " + make_token(biz)}


def upload_sales(client, auth, conn, csv_text=SALES_CSV):
    response = client.post(
        "/uploads",
        headers=auth,
        files={"file": ("sales.csv", csv_text.encode(), "text/csv")},
        data={"upload_type": "sales"},
    )
    assert response.status_code == 202
    process_job(conn, uuid.UUID(response.json()["job_id"]))


def test_sales_analytics_returns_filtered_kpis_and_daily_monthly_trends(client, auth, conn):
    upload_sales(client, auth, conn)

    daily = client.get(
        "/analytics/sales",
        params={"start_date": "2026-03-10", "end_date": "2026-03-11", "interval": "daily"},
        headers=auth,
    )
    assert daily.status_code == 200
    assert daily.json()["metrics"] == {
        "gross_revenue": 35.0,
        "orders": 2,
        "average_order_value": 17.5,
    }
    assert daily.json()["trend"] == [
        {"period": "2026-03-10", "gross_revenue": 25.0, "orders": 1},
        {"period": "2026-03-11", "gross_revenue": 10.0, "orders": 1},
    ]

    monthly = client.get(
        "/analytics/sales",
        params={"start_date": "2026-03-01", "end_date": "2026-03-31", "interval": "monthly"},
        headers=auth,
    )
    assert monthly.status_code == 200
    assert monthly.json()["trend"] == [
        {"period": "2026-03-01", "gross_revenue": 135.0, "orders": 3},
    ]


def test_sales_analytics_requires_auth_and_rejects_invalid_ranges(client, auth):
    assert client.get("/analytics/sales").status_code == 401
    assert client.get(
        "/analytics/sales",
        headers={"Authorization": "Bearer invalid"},
        params={"start_date": "2026-03-01", "end_date": "2026-03-31"},
    ).status_code == 401
    assert client.get(
        "/analytics/sales",
        headers=auth,
        params={"start_date": "2026-03-31", "end_date": "2026-03-01"},
    ).status_code == 422
    assert client.get(
        "/analytics/sales",
        headers=auth,
        params={"start_date": "2026-03-01", "end_date": "2026-03-31", "interval": "weekly"},
    ).status_code == 422


def test_sales_analytics_is_scoped_to_the_authenticated_business(client, auth, conn):
    upload_sales(client, auth, conn)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO businesses(business_name) VALUES('analytics-other') RETURNING business_id"
    )
    other_business_id = cursor.fetchone()[0]
    conn.commit()
    other_auth = {"Authorization": "Bearer " + make_token(other_business_id)}
    upload_sales(client, other_auth, conn, SALES_CSV.replace(",100,C2", ",200,C2"))

    own = client.get(
        "/analytics/sales",
        headers=auth,
        params={"start_date": "2026-03-10", "end_date": "2026-03-12"},
    ).json()
    other = client.get(
        "/analytics/sales",
        headers=other_auth,
        params={"start_date": "2026-03-10", "end_date": "2026-03-12"},
    ).json()
    assert own["metrics"]["gross_revenue"] == 135.0
    assert other["metrics"]["gross_revenue"] == 235.0
