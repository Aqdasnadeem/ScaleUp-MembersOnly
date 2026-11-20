import uuid

from fastapi.testclient import TestClient

from app.main import app
from app.pipeline import process_job
from tests.conftest import make_token


def upload_inventory(client, auth, conn, csv_text):
    response = client.post(
        "/uploads",
        headers=auth,
        files={"file": ("inventory.csv", csv_text.encode(), "text/csv")},
        data={"upload_type": "inventory"},
    )
    assert response.status_code == 202
    result = process_job(conn, uuid.UUID(response.json()["job_id"]))
    assert result["status"] == "completed"


def test_inventory_history_uses_saved_snapshots_and_is_business_scoped(conn, biz):
    client = TestClient(app)
    auth = {"Authorization": "Bearer " + make_token(conn, biz)}
    upload_inventory(client, auth, conn, (
        "SKU,Product,Stock,Date\n"
        "P1,Pen,4,2026-03-03\n"
        "P1,Pen,15,2026-03-01\n"
        "P2,Book,25,2026-03-01\n"
    ))
    products = client.get("/analytics/inventory/products", headers=auth)
    product_id = {item["product_key"]: item for item in products.json()["products"]}["P1"]["product_id"]

    url = f"/analytics/inventory/products/{product_id}/history"
    # Acceptance criterion: the history matches exactly what was imported, in date order.
    assert client.get(url, headers=auth).json() == {
        "product_id": product_id,
        "snapshots": [
            {"snapshot_date": "2026-03-01", "stock_quantity": 15},
            {"snapshot_date": "2026-03-03", "stock_quantity": 4},
        ],
    }
    assert client.get(url).status_code == 401

    cursor = conn.cursor()
    cursor.execute("INSERT INTO businesses(business_name) VALUES('history-other') RETURNING business_id")
    other_id = cursor.fetchone()[0]
    conn.commit()
    other_auth = {"Authorization": "Bearer " + make_token(conn, other_id)}
    assert client.get(url, headers=other_auth).status_code == 404
    assert client.get("/analytics/inventory/products/999999999/history", headers=auth).status_code == 404
    assert client.get("/analytics/inventory/products/9999999999999999999999/history", headers=auth).status_code == 422


def test_history_is_empty_list_for_a_product_with_no_snapshots_yet(conn, biz):
    """A product can exist (from a sales import) before any inventory file names it."""
    client = TestClient(app)
    auth = {"Authorization": "Bearer " + make_token(conn, biz)}
    job = uuid.uuid4()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO ingestion_jobs(job_id, business_id, upload_type, file_name, file_hash, status) "
        "VALUES (%s, %s, 'sales', 'x.csv', repeat('a', 64), 'completed')",
        (job, biz),
    )
    cursor.execute(
        "INSERT INTO products(business_id, job_id, product_key, product_name) VALUES (%s, %s, 'P9', 'No snapshot yet') "
        "RETURNING product_id",
        (biz, job),
    )
    product_id = cursor.fetchone()[0]
    conn.commit()

    response = client.get(f"/analytics/inventory/products/{product_id}/history", headers=auth)
    assert response.status_code == 200
    assert response.json() == {"product_id": product_id, "snapshots": []}
