import os
import uuid
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from app import auth as auth_module
from app.routes_uploads import get_conn
from app.main import app
from tests.conftest import make_token


@pytest.fixture
def client(conn, monkeypatch):
    """Use the test connection and patch the existing JWT config mismatch."""
    monkeypatch.setattr(
        auth_module, "jwt_secret", lambda: os.environ["JWT_SECRET"]
    )
    app.dependency_overrides[get_conn] = lambda: conn

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.pop(get_conn, None)


def create_job_and_product(conn, biz, cost_price=10):
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO ingestion_jobs
            (business_id, upload_type, file_name, file_hash, status)
        VALUES (%s, 'sales', 'anomaly-test.csv', repeat('a', 64), 'completed')
        RETURNING job_id
        """,
        (biz,),
    )
    job_id = cur.fetchone()[0]

    cur.execute(
        """
        INSERT INTO products
            (business_id, job_id, product_key, product_name, cost_price)
        VALUES (%s, %s, %s, 'Test Product', %s)
        RETURNING product_id
        """,
        (biz, job_id, "P-" + uuid.uuid4().hex[:10], cost_price),
    )
    product_id = cur.fetchone()[0]
    conn.commit()

    return job_id, product_id


def add_sales_history(conn, biz, days=14):
    job_id, product_id = create_job_and_product(conn, biz)
    start = date(2026, 1, 1)
    cur = conn.cursor()

    for i in range(days):
        sale_day = start + timedelta(days=i)
        cur.execute(
            """
            INSERT INTO sales
                (business_id, job_id, product_id, order_id,
                 sale_date, quantity, unit_price, total_amount)
            VALUES (%s, %s, %s, %s, %s, 1, 100, 100)
            """,
            (biz, job_id, product_id, "BASE-" + str(i), sale_day),
        )

    target_day = start + timedelta(days=28)
    cur.execute(
        """
        INSERT INTO sales
            (business_id, job_id, product_id, order_id,
             sale_date, quantity, unit_price, total_amount)
        VALUES (%s, %s, %s, 'SPIKE-ORDER', %s, 10, 100, 1000)
        """,
        (biz, job_id, product_id, target_day),
    )
    conn.commit()


def test_detects_daily_revenue_spike_and_rerun_is_idempotent(conn, biz):
    from app.anomalies import run_detection

    add_sales_history(conn, biz, days=14)

    first = run_detection(conn, biz)
    second = run_detection(conn, biz)

    cur = conn.cursor()
    cur.execute(
        """
        SELECT COUNT(*), MAX(observed_value), MAX(expected_value)
        FROM anomalies
        WHERE business_id = %s AND anomaly_type = 'sales'
        """,
        (biz,),
    )
    count, observed, expected = cur.fetchone()

    assert first["sales"] == 1
    assert second["sales"] == 1
    assert count == 1
    assert float(observed) == 1000
    assert float(expected) > 0


def test_does_not_detect_sales_spike_with_less_than_14_baseline_days(conn, biz):
    from app.anomalies import detect_sales_anomalies

    add_sales_history(conn, biz, days=13)

    assert detect_sales_anomalies(conn, biz) == 0

    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM anomalies WHERE business_id = %s",
        (biz,),
    )
    assert cur.fetchone()[0] == 0


def test_detects_inventory_drop(conn, biz):
    from app.anomalies import detect_inventory_anomalies

    job_id, product_id = create_job_and_product(conn, biz)
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO inventory
            (business_id, job_id, product_id, snapshot_date, stock_quantity)
        VALUES
            (%s, %s, %s, '2026-02-01', 100),
            (%s, %s, %s, '2026-02-02', 40)
        """,
        (biz, job_id, product_id, biz, job_id, product_id),
    )
    conn.commit()

    assert detect_inventory_anomalies(conn, biz) == 1

    cur.execute(
        """
        SELECT anomaly_type, observed_value, expected_value, subject_key
        FROM anomalies
        WHERE business_id = %s
        """,
        (biz,),
    )
    row = cur.fetchone()

    assert row[0] == "inventory"
    assert float(row[1]) == 40
    assert float(row[2]) == 100
    assert row[3] == str(product_id)


def test_inventory_allows_multiple_products_on_same_date(conn, biz):
    from app.anomalies import detect_inventory_anomalies

    cur = conn.cursor()
    job_id, product_one = create_job_and_product(conn, biz)
    _, product_two = create_job_and_product(conn, biz)

    for product_id in (product_one, product_two):
        cur.execute(
            """
            INSERT INTO inventory
                (business_id, job_id, product_id, snapshot_date, stock_quantity)
            VALUES
                (%s, %s, %s, '2026-02-01', 100),
                (%s, %s, %s, '2026-02-02', 40)
            """,
            (biz, job_id, product_id, biz, job_id, product_id),
        )

    conn.commit()

    assert detect_inventory_anomalies(conn, biz) == 2


def test_list_api_filters_type_but_keeps_all_counts(conn, biz, client):
    cur = conn.cursor()

    for anomaly_type in ("sales", "inventory", "expense"):
        cur.execute(
            """
            INSERT INTO anomalies
                (business_id, anomaly_type, severity, metric_date,
                 observed_value, expected_value, evidence)
            VALUES (%s, %s, 'warning', '2026-03-01', 100, 50, '{}'::jsonb)
            """,
            (biz, anomaly_type),
        )

    conn.commit()
    headers = {"Authorization": "Bearer " + make_token(conn, biz)}

    response = client.get("/anomalies?type=sales", headers=headers)

    assert response.status_code == 200
    body = response.json()
    assert len(body["anomalies"]) == 1
    assert body["anomalies"][0]["type"] == "sales"
    assert body["counts"] == {
        "sales": 1,
        "inventory": 1,
        "expense": 1,
    }


def test_invalid_type_returns_422(client, conn, biz):
    headers = {"Authorization": "Bearer " + make_token(conn, biz)}

    response = client.get("/anomalies?type=unknown", headers=headers)

    assert response.status_code == 422


def test_anomaly_detail_is_hidden_from_another_business(
    conn, biz, client
):
    other_business = uuid.uuid4()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO businesses (business_id, business_name)
        VALUES (%s, 'Other Test Business')
        """,
        (str(other_business),),
    )
    cur.execute(
        """
        INSERT INTO anomalies
            (business_id, anomaly_type, severity, metric_date,
             observed_value, expected_value, evidence)
        VALUES (%s, 'sales', 'warning', '2026-03-01', 100, 50, '{}'::jsonb)
        RETURNING anomaly_id
        """,
        (str(biz),),
    )
    anomaly_id = cur.fetchone()[0]
    conn.commit()

    headers = {
        "Authorization": "Bearer " + make_token(conn, other_business)
    }
    response = client.get(
        "/anomalies/" + str(anomaly_id),
        headers=headers,
    )

    assert response.status_code == 404


def test_anomaly_api_requires_authentication(client):
    response = client.get("/anomalies")

    assert response.status_code == 401


def test_a_failing_detector_does_not_lose_the_others_results(conn, biz, monkeypatch):
    """Sir, 18 Nov: expense detector raising must not roll back sales/inventory, which already
    committed their own anomalies before expense detection ran."""
    from app import anomalies as anomalies_module

    add_sales_history(conn, biz, days=14)
    job_id, product_id = create_job_and_product(conn, biz)
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO inventory
            (business_id, job_id, product_id, snapshot_date, stock_quantity)
        VALUES
            (%s, %s, %s, '2026-02-01', 100),
            (%s, %s, %s, '2026-02-02', 40)
        """,
        (biz, job_id, product_id, biz, job_id, product_id),
    )
    conn.commit()

    def boom(conn, business_id):
        raise RuntimeError("expense_flags boom")

    monkeypatch.setattr(anomalies_module, "detect_expense_anomalies", boom)

    result = anomalies_module.run_detection(conn, biz)

    assert result["sales"] == 1 and result["inventory"] == 1 and result["expense"] == 0

    cur.execute(
        "SELECT anomaly_type, COUNT(*) FROM anomalies WHERE business_id = %s GROUP BY anomaly_type",
        (biz,),
    )
    counts = dict(cur.fetchall())
    assert counts.get("sales") == 1
    assert counts.get("inventory") == 1
    assert "expense" not in counts
