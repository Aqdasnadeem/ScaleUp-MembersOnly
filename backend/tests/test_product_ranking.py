import uuid
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from psycopg2.extras import register_uuid

register_uuid()

from app.main import app

from tests.conftest import make_token
from tests.helpers import new_job

client = TestClient(app)


def add_product(conn, biz, job, key, cost):
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO products
            (business_id, job_id, product_key, product_name, cost_price)
        VALUES (%s, %s, %s, %s, %s)
        RETURNING product_id
        """,
        (biz, job, key, f"Product {key}", cost),
    )
    product_id = cur.fetchone()[0]
    conn.commit()
    return product_id


def add_sale(conn, biz, job, product_id, order_id, sale_date, quantity, amount):
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO sales
            (business_id, job_id, product_id, order_id, sale_date,
             quantity, unit_price, total_amount)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            biz, job, product_id, order_id, sale_date,
            quantity, amount / quantity, amount,
        ),
    )
    conn.commit()


def setup_sales(conn, biz):
    job = new_job(
        conn,
        biz,
        "sales",
        "Order No,Date,SKU,Product,Qty,Unit Price,Customer\n"
        "DUMMY,08/01/2026,DUMMY,Dummy,1,1,Test\n",
    )
    return job


def headers(conn, biz):
    return {"Authorization": f"Bearer {make_token(conn, biz)}"}


def test_revenue_margin_and_previous_period(conn, biz):
    job = setup_sales(conn, biz)
    product = add_product(conn, biz, job, "P1", Decimal("4.00"))

    add_sale(conn, biz, job, product, "OLD-1", date(2026, 1, 8), 5, Decimal("50"))
    add_sale(conn, biz, job, product, "NEW-1", date(2026, 1, 10), 10, Decimal("100"))
    add_sale(conn, biz, job, product, "NEW-2", date(2026, 1, 11), 5, Decimal("50"))

    response = client.get(
        "/analytics/products/ranking?from=2026-01-10&to=2026-01-11",
        headers=headers(conn, biz),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["from"] == "2026-01-10"
    assert body["to"] == "2026-01-11"
    assert body["previous_range"] == {
        "from": "2026-01-08",
        "to": "2026-01-09",
    }

    item = body["data"][0]
    assert item["revenue"] == 150.0
    assert item["units"] == 15
    assert item["margin"] == 90.0
    assert item["margin_pct"] == 60.0
    assert item["previous_revenue"] == 50.0
    assert item["previous_units"] == 5
    assert item["revenue_change_pct"] == 200.0


def test_products_without_cost_have_null_margin(conn, biz):
    job = setup_sales(conn, biz)
    product = add_product(conn, biz, job, "NO-COST", None)
    add_sale(conn, biz, job, product, "SALE-1", date(2026, 1, 10), 2, Decimal("40"))

    response = client.get(
        "/analytics/products/ranking?from=2026-01-10&to=2026-01-10",
        headers=headers(conn, biz),
    )

    assert response.status_code == 200
    item = response.json()["data"][0]
    assert item["margin"] is None
    assert item["margin_pct"] is None
    assert response.json()["products_without_cost"] == 1


def test_margin_sort_excludes_products_without_cost(conn, biz):
    job = setup_sales(conn, biz)
    known = add_product(conn, biz, job, "KNOWN", Decimal("2.00"))
    unknown = add_product(conn, biz, job, "UNKNOWN", None)

    add_sale(conn, biz, job, known, "KNOWN-1", date(2026, 1, 10), 2, Decimal("20"))
    add_sale(conn, biz, job, unknown, "UNKNOWN-1", date(2026, 1, 10), 2, Decimal("30"))

    response = client.get(
        "/analytics/products/ranking?from=2026-01-10&to=2026-01-10&sort=margin",
        headers=headers(conn, biz),
    )

    assert response.status_code == 200
    body = response.json()
    assert body["products_without_cost"] == 1
    assert len(body["data"]) == 1
    assert body["data"][0]["product_key"] == "KNOWN"


def test_previous_period_only_product_is_not_ranked(conn, biz):
    job = setup_sales(conn, biz)
    product = add_product(conn, biz, job, "OLD-ONLY", Decimal("2.00"))
    add_sale(conn, biz, job, product, "OLD-SALE", date(2026, 1, 8), 1, Decimal("10"))

    response = client.get(
        "/analytics/products/ranking?from=2026-01-10&to=2026-01-11",
        headers=headers(conn, biz),
    )

    assert response.status_code == 200
    assert response.json()["data"] == []


def test_no_sales_returns_empty_ranking(conn, biz):
    response = client.get(
        "/analytics/products/ranking",
        headers=headers(conn, biz),
    )

    assert response.status_code == 200
    assert response.json()["data"] == []
    assert response.json()["from"] is None
    assert response.json()["to"] is None


def test_invalid_sort_returns_422(conn, biz):
    response = client.get(
        "/analytics/products/ranking?sort=unknown",
        headers=headers(conn, biz),
    )
    assert response.status_code == 422


def test_invalid_date_range_returns_422(conn, biz):
    response = client.get(
        "/analytics/products/ranking?from=2026-01-12&to=2026-01-10",
        headers=headers(conn, biz),
    )
    assert response.status_code == 422


def test_limit_above_50_returns_422(conn, biz):
    response = client.get(
        "/analytics/products/ranking?limit=51",
        headers=headers(conn, biz),
    )
    assert response.status_code == 422


def test_missing_token_returns_401():
    response = client.get("/analytics/products/ranking")
    assert response.status_code == 401


def test_tenant_isolation(conn, biz):
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO businesses (business_name)
        VALUES (%s)
        RETURNING business_id
        """,
        ("Second Test Business",),
    )
    other_biz = cur.fetchone()[0]
    conn.commit()

    other_job = new_job(
        conn,
        other_biz,
        "sales",
        "Order No,Date,SKU,Product,Qty,Unit Price,Customer\n"
        "DUMMY,08/01/2026,DUMMY,Dummy,1,1,Test\n",
    )
    other_product = add_product(
        conn, other_biz, other_job, "OTHER-BIZ-PRODUCT", Decimal("5.00")
    )
    add_sale(
        conn, other_biz, other_job, other_product,
        "OTHER-BIZ-SALE", date(2026, 1, 10), 2, Decimal("100")
    )

    response = client.get(
        "/analytics/products/ranking?from=2026-01-10&to=2026-01-10",
        headers=headers(conn, biz),
    )

    assert response.status_code == 200
    assert response.json()["data"] == []
