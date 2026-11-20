import uuid
from datetime import date

from fastapi.testclient import TestClient
from psycopg2.extras import register_uuid

register_uuid()

from app.main import app
from tests.conftest import make_token
from tests.helpers import new_job


client = TestClient(app)


def seed_sales(conn, biz, rows):
    job = new_job(conn, biz, "sales", "Order No,Date,SKU,Product,Qty,Unit Price,Customer\nTEST,01/10/2026,P1,Test,1,10,Test\n")

    cur = conn.cursor()
    products = {}

    for order_id, sale_date, sku, quantity, unit_price, total in rows:
        if sku not in products:
            cur.execute(
                """
                INSERT INTO products
                    (business_id, job_id, product_key, product_name, cost_price)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING product_id
                """,
                (biz, job, sku, sku, 5),
            )
            products[sku] = cur.fetchone()[0]

        cur.execute(
            """
            INSERT INTO sales
                (business_id, job_id, product_id, order_id,
                 sale_date, quantity, unit_price, total_amount)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                biz, job, products[sku], order_id,
                sale_date, quantity, unit_price, total,
            ),
        )

    conn.commit()


def auth(conn, biz):
    return {"Authorization": "Bearer " + make_token(conn, biz)}


def test_kpis_return_correct_totals(conn, biz):
    seed_sales(conn, biz, [
        ("O1", date(2026, 10, 1), "P1", 2, 10, 20),
        ("O1", date(2026, 10, 1), "P2", 1, 15, 15),
        ("O2", date(2026, 10, 3), "P1", 3, 10, 30),
    ])

    response = client.get("/analytics/sales/kpis", headers=auth(conn, biz))

    assert response.status_code == 200
    data = response.json()
    assert data["gross_revenue"] == 65.00
    assert data["orders"] == 2
    assert data["units_sold"] == 6
    assert data["avg_order_value"] == 32.50
    assert data["range"] == {"from": "2026-10-01", "to": "2026-10-03"}


def test_kpis_apply_inclusive_date_filters(conn, biz):
    seed_sales(conn, biz, [
        ("O1", date(2026, 10, 1), "P1", 1, 10, 10),
        ("O2", date(2026, 10, 2), "P1", 2, 10, 20),
        ("O3", date(2026, 10, 3), "P1", 3, 10, 30),
    ])

    response = client.get(
        "/analytics/sales/kpis?from=2026-10-02&to=2026-10-03",
        headers=auth(conn, biz),
    )

    assert response.status_code == 200
    assert response.json()["gross_revenue"] == 50.00
    assert response.json()["orders"] == 2


def test_daily_trend_includes_empty_dates(conn, biz):
    seed_sales(conn, biz, [
        ("O1", date(2026, 10, 1), "P1", 1, 10, 10),
        ("O2", date(2026, 10, 3), "P1", 1, 20, 20),
    ])

    response = client.get(
        "/analytics/sales/trend?from=2026-10-01&to=2026-10-03",
        headers=auth(conn, biz),
    )

    assert response.status_code == 200
    assert response.json()["data"] == [
        {"period": "2026-10-01", "revenue": 10.00},
        {"period": "2026-10-02", "revenue": 0.00},
        {"period": "2026-10-03", "revenue": 20.00},
    ]


def test_monthly_trend_includes_empty_months(conn, biz):
    seed_sales(conn, biz, [
        ("O1", date(2026, 10, 5), "P1", 1, 10, 10),
        ("O2", date(2026, 12, 5), "P1", 1, 20, 20),
    ])

    response = client.get(
        "/analytics/sales/trend?from=2026-10-01&to=2026-12-31&granularity=month",
        headers=auth(conn, biz),
    )

    assert response.status_code == 200
    assert response.json()["data"] == [
        {"period": "2026-10-01", "revenue": 10.00},
        {"period": "2026-11-01", "revenue": 0.00},
        {"period": "2026-12-01", "revenue": 20.00},
    ]


def test_no_sales_returns_zero_kpis_and_empty_trend(conn, biz):
    response = client.get("/analytics/sales/kpis", headers=auth(conn, biz))

    assert response.status_code == 200
    assert response.json()["gross_revenue"] == 0.00
    assert response.json()["orders"] == 0
    assert response.json()["units_sold"] == 0
    assert response.json()["avg_order_value"] is None

    trend = client.get("/analytics/sales/trend", headers=auth(conn, biz))
    assert trend.status_code == 200
    assert trend.json()["data"] == []


def test_invalid_date_range_returns_422(conn, biz):
    response = client.get(
        "/analytics/sales/kpis?from=2026-10-10&to=2026-10-01",
        headers=auth(conn, biz),
    )
    assert response.status_code == 422


def test_missing_token_returns_401():
    response = client.get("/analytics/sales/kpis")
    assert response.status_code == 401


def test_business_cannot_see_another_business_sales(conn, biz):
    other_biz = uuid.uuid4()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO businesses (business_id, business_name) VALUES (%s, %s)",
        (str(other_biz), "Other business"),
    )
    conn.commit()

    seed_sales(conn, other_biz, [
        ("O1", date(2026, 10, 1), "P1", 1, 100, 100),
    ])

    response = client.get("/analytics/sales/kpis", headers=auth(conn, biz))
    assert response.status_code == 200
    assert response.json()["gross_revenue"] == 0.00
    assert response.json()["orders"] == 0
