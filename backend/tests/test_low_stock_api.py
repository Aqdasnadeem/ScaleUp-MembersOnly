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


def test_alerts_use_latest_snapshots_and_strict_threshold(conn, biz):
    client = TestClient(app)
    auth = {"Authorization": "Bearer " + make_token(conn, biz)}
    upload_inventory(client, auth, conn, (
        "SKU,Product,Stock,Date\n"
        "P1,Pen,2,2026-03-01\n"
        "P2,Cap,0,2026-03-01\n"
        "P3,Mug,10,2026-03-01\n"
        "P4,Book,5,2026-03-01\n"
    ))
    upload_inventory(client, auth, conn, (
        "SKU,Product,Stock,Date\n"
        "P1,Pen,12,2026-03-02\n"
        "P4,Book,3,2026-03-02\n"
    ))
    response = client.get("/analytics/inventory/alerts", headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["threshold"] == 10
    assert body["has_inventory"] is True
    assert [(item["product_key"], item["stock_quantity"], item["status"]) for item in body["alerts"]] == [
        ("P2", 0, "stockout"), ("P4", 3, "low_stock")
    ]
    assert body["alerts"][1]["snapshot_date"] == "2026-03-02"
    detail = client.get(f"/analytics/inventory/products/{body['alerts'][1]['product_id']}", headers=auth)
    assert detail.status_code == 200
    assert detail.json() == body["alerts"][1]

    # Acceptance criterion: threshold is configurable per business.
    conn.cursor().execute("UPDATE businesses SET low_stock_threshold=0 WHERE business_id=%s", (biz,))
    conn.commit()
    assert [item["product_key"] for item in client.get("/analytics/inventory/alerts", headers=auth).json()["alerts"]] == ["P2"]


def test_alerts_auth_empty_and_product_business_isolation(conn, biz):
    client = TestClient(app)
    auth = {"Authorization": "Bearer " + make_token(conn, biz)}
    upload_inventory(client, auth, conn, "SKU,Product,Stock,Date\nP1,Pen,0,2026-03-01\n")
    product_id = client.get("/analytics/inventory/alerts", headers=auth).json()["alerts"][0]["product_id"]
    cursor = conn.cursor()
    cursor.execute("INSERT INTO businesses(business_name) VALUES('inventory-other') RETURNING business_id")
    other_id = cursor.fetchone()[0]
    conn.commit()
    other_auth = {"Authorization": "Bearer " + make_token(conn, other_id)}
    assert client.get("/analytics/inventory/alerts").status_code == 401
    assert client.get(f"/analytics/inventory/products/{product_id}").status_code == 401
    empty = client.get("/analytics/inventory/alerts", headers=other_auth).json()
    assert empty["alerts"] == []
    assert empty["has_inventory"] is False
    assert client.get(f"/analytics/inventory/products/{product_id}", headers=other_auth).status_code == 404
    assert client.get("/analytics/inventory/products/999999999", headers=auth).status_code == 404
    assert client.get("/analytics/inventory/products/9999999999999999999999", headers=auth).status_code == 422


def test_products_list_reflects_latest_snapshot_per_product(conn, biz):
    client = TestClient(app)
    auth = {"Authorization": "Bearer " + make_token(conn, biz)}
    upload_inventory(client, auth, conn, (
        "SKU,Product,Stock,Date\n"
        "P1,Pen,4,2026-03-03\n"
        "P1,Pen,15,2026-03-01\n"
        "P2,Book,25,2026-03-01\n"
    ))
    products = client.get("/analytics/inventory/products", headers=auth)
    assert products.status_code == 200
    by_key = {item["product_key"]: item for item in products.json()["products"]}
    assert by_key["P1"]["stock_quantity"] == 4
    assert by_key["P2"]["status"] == "in_stock"
    assert client.get("/analytics/inventory/products").status_code == 401

    cursor = conn.cursor()
    cursor.execute("INSERT INTO businesses(business_name) VALUES('products-other') RETURNING business_id")
    other_id = cursor.fetchone()[0]
    conn.commit()
    other_auth = {"Authorization": "Bearer " + make_token(conn, other_id)}
    assert client.get("/analytics/inventory/products", headers=other_auth).json()["products"] == []
