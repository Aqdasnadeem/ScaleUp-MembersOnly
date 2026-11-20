"""P2-11: upload API. Criteria: POST /uploads returns 202 + job_id in under 1 s; GET /uploads/{id} returns status.
Also FR-UP-02 (type/size), FR-AUTH-03 (business from the JWT only; another business gets 404), FR-UP-05 (mapping saved), FR-UP-08 (same content)."""
import time
import uuid
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import config
from app.pipeline import process_job
from tests.conftest import make_token
from tests.helpers import count

H = "Order No,Date,SKU,Product,Qty,Unit Price,Customer\n"
GOOD = H + "A1,03/10/2026,P1,Pen,2,10,C1\nA2,03/10/2026,P2,Cap,1,5,\n"

@pytest.fixture()
def client(): return TestClient(app)
@pytest.fixture()
def auth(biz, conn): return {"Authorization": "Bearer " + make_token(conn, biz)}

def post(client, auth, text=GOOD, name="sales.csv", **form):
    form.setdefault("upload_type", "sales")
    return client.post("/uploads", headers=auth, files={"file": (name, text.encode(), "text/csv")}, data=form)

def test_post_returns_202_and_job_id_under_1_second_then_get_status(client, auth, conn, biz):
    big = H + "".join("O%05d,%02d/09/2026,P%02d,Item,1,50,C%d\n" % (i, i % 28 + 1, i % 40, i % 300) for i in range(10000))
    t0 = time.time(); r = post(client, auth, big); secs = time.time() - t0
    print("\nPOST /uploads, 10,000 rows: HTTP %d in %.3f s" % (r.status_code, secs))
    assert r.status_code == 202 and secs < 1 and r.json()["status"] == "pending"
    job = r.json()["job_id"]
    g = client.get("/uploads/" + job, headers=auth).json()
    assert g["status"] == "pending" and g["upload_type"] == "sales" and g["file_name"] == "sales.csv"
    process_job(conn, uuid.UUID(job))                                     # the worker (P2-51) would do this
    g = client.get("/uploads/" + job, headers=auth).json()
    assert g["status"] == "completed" and g["loaded_rows"] == 10000 and g["error_report"] == []

def test_get_shows_bad_rows_report(client, auth, conn):
    filler = "".join("F%d,03/10/2026,P9,Pen,1,5,\n" % i for i in range(10))          # keep the bad rows under 20%
    job = post(client, auth, GOOD + filler + "A3,31/02/2026,P3,Mug,1,5,\n").json()["job_id"]
    process_job(conn, uuid.UUID(job))
    g = client.get("/uploads/" + job, headers=auth).json()
    assert g["status"] == "completed_with_warnings" and g["rejected_rows"] == 1
    assert g["error_report"] == [{"row": 14, "column": "Date", "reason": "not a real date"}]

def test_no_token_or_bad_token_is_401(client):
    assert client.get("/uploads/" + str(uuid.uuid4())).status_code == 401
    assert client.get("/uploads/" + str(uuid.uuid4()), headers={"Authorization": "Bearer nonsense"}).status_code == 401
    assert client.post("/uploads", files={"file": ("a.csv", b"x", "text/csv")}, data={"upload_type": "sales"}).status_code == 401

def test_other_business_cannot_see_the_job(client, auth, conn):
    job = post(client, auth).json()["job_id"]
    c = conn.cursor(); c.execute("insert into businesses(business_name) values('other') returning business_id"); other = c.fetchone()[0]; conn.commit()
    r = client.get("/uploads/" + job, headers={"Authorization": "Bearer " + make_token(conn, other)})
    assert r.status_code == 404
def test_business_id_in_the_request_is_ignored(client, auth, conn, biz):
    c = conn.cursor(); c.execute("insert into businesses(business_name) values('victim') returning business_id"); victim = c.fetchone()[0]; conn.commit()
    job = post(client, auth, business_id=str(victim)).json()["job_id"]      # extra form field must not matter
    c.execute("select business_id from ingestion_jobs where job_id=%s", (job,)); assert c.fetchone()[0] == biz

def test_wrong_type_and_oversize_create_no_job(client, auth, conn, biz, monkeypatch):
    assert post(client, auth, name="data.xlsx").status_code == 415
    assert post(client, auth, upload_type="products").status_code == 422
    monkeypatch.setattr(config, "MAX_UPLOAD_MB", 0)
    assert post(client, auth).status_code == 413
    c = conn.cursor(); c.execute("select count(*) from ingestion_jobs where business_id=%s", (biz,)); assert c.fetchone()[0] == 0

def test_unusable_file_is_refused_with_a_message(client, auth):
    r = post(client, auth, text="")
    assert r.status_code == 422 and "empty" in r.json()["detail"]
    r = post(client, auth, text="a,b\n")
    assert r.status_code == 422 and "no data rows" in r.json()["detail"]

def test_mapping_problems_are_listed_and_no_job_is_created(client, auth, conn, biz):
    r = post(client, auth, mapping='{"order_id":"Invoice"}')
    assert r.status_code == 422
    assert any('mapped column not found in file: order_id -> "Invoice"' in m for m in r.json()["detail"])
    c = conn.cursor(); c.execute("select count(*) from ingestion_jobs where business_id=%s", (biz,)); assert c.fetchone()[0] == 0
    assert post(client, auth, mapping="not json").status_code == 422

def test_mapping_is_saved_and_reused(client, auth, conn, biz):
    text = "Name,Paid at,Lineitem sku,Lineitem quantity,Lineitem price\n#1001,03/10/2026,MUG,2,450\n"
    m = '{"order_id":"Name","date":"Paid at","product_code":"Lineitem sku","quantity":"Lineitem quantity","unit_price":"Lineitem price"}'
    assert post(client, auth, text, mapping=m).status_code == 202
    p = client.post("/uploads/preview", headers=auth, files={"file": ("s.csv", text.encode(), "text/csv")}, data={"upload_type": "sales"}).json()
    assert p["saved_mapping"]["order_id"] == "Name" and p["columns"][0] == "Name"            # second time: no remapping needed
    text2 = text.replace("#1001", "#1002")
    assert post(client, auth, text2).status_code == 202                                       # no mapping sent: the saved one is used

def test_preview_suggests_columns_and_creates_nothing(client, auth, conn, biz):
    p = client.post("/uploads/preview", headers=auth, files={"file": ("s.csv", GOOD.encode(), "text/csv")}, data={"upload_type": "sales"}).json()
    assert p["suggested_mapping"]["order_id"] == "Order No" and p["saved_mapping"] is None and p["needs_snapshot_date"] is False
    c = conn.cursor(); c.execute("select count(*) from ingestion_jobs where business_id=%s", (biz,)); assert c.fetchone()[0] == 0

def test_preview_fills_missing_saved_product_name_from_suggestion(client, auth):
    first = "Order No,Date,SKU,Item,Qty,Unit Price\nB1,03/10/2026,P1,Pen,2,10\n"
    mapping = '{"order_id":"Order No","date":"Date","product_code":"SKU","quantity":"Qty","unit_price":"Unit Price"}'
    assert post(client, auth, first, mapping=mapping).status_code == 202
    second = "Order No,Date,SKU,Item,Qty,Unit Price\nB2,03/10/2026,P2,Cap,1,5\n"
    preview = client.post(
        "/uploads/preview",
        headers=auth,
        files={"file": ("sales.csv", second.encode(), "text/csv")},
        data={"upload_type": "sales"},
    ).json()
    assert preview["saved_mapping"]["product_name"] == "Item"

def test_preview_returns_saved_mapping_that_fits_file(client, auth):
    sales = "Order No,Date,SKU,Product,Qty,Unit Price\nB1,03/10/2026,P1,Pen,2,10\n"
    mapping = '{"order_id":"Order No","date":"Date","product_code":"SKU","product_name":"Product","quantity":"Qty","unit_price":"Unit Price"}'
    assert post(client, auth, sales, mapping=mapping).status_code == 202
    preview = client.post(
        "/uploads/preview",
        headers=auth,
        files={"file": ("sales.csv", sales.encode(), "text/csv")},
        data={"upload_type": "sales"},
    ).json()
    assert preview["saved_mapping"]["product_name"] == "Product"

def test_preview_drops_saved_column_missing_from_file_and_uses_suggestion(client, auth):
    first = "Order No,Date,SKU,Product,Qty,Unit Price\nB1,03/10/2026,P1,Pen,2,10\n"
    assert post(client, auth, first).status_code == 202
    second = "Order No,Date,SKU,Item,Qty,Unit Price\nB2,03/10/2026,P2,Cap,1,5\n"
    preview = client.post(
        "/uploads/preview",
        headers=auth,
        files={"file": ("sales.csv", second.encode(), "text/csv")},
        data={"upload_type": "sales"},
    ).json()
    assert preview["saved_mapping"]["product_name"] == "Item"
    assert "Product" not in preview["saved_mapping"].values()

def test_same_content_new_name_is_detected_then_skip(client, auth, conn):
    j = post(client, auth).json()["job_id"]; process_job(conn, uuid.UUID(j))
    r = post(client, auth, name="renamed.csv")                                                # same content, other file name
    assert r.status_code == 409 and r.json()["warning"] == "same_file_already_loaded" and r.json()["existing_job_id"] == j
    assert r.json()["choose"] == ["skip", "replace"]
    s = post(client, auth, name="renamed.csv", on_duplicate="skip")
    assert s.status_code == 200 and s.json()["status"] == "skipped"
    assert post(client, auth, name="renamed.csv", on_duplicate="replace").status_code == 501   # see OI-9

def test_inventory_snapshot_date_is_stored(client, auth, conn):
    r = post(client, auth, "SKU,Stock\nP1,5\n", upload_type="inventory", snapshot_date="2026-09-01")
    assert r.status_code == 202
    assert post(client, auth, "SKU,Stock\nP1,5\n", upload_type="inventory").status_code == 422     # no date column and no as-of date
    process_job(conn, uuid.UUID(r.json()["job_id"]))
    c = conn.cursor(); c.execute("select i.snapshot_date from inventory i join ingestion_jobs j using(job_id) where j.job_id=%s", (r.json()["job_id"],))
    assert str(c.fetchone()[0]) == "2026-09-01"

def test_original_file_is_kept(client, auth):
    import os
    job = post(client, auth).json()["job_id"]
    assert open(os.path.join(config.UPLOAD_DIR, job + ".csv"), "rb").read() == GOOD.encode()

def test_saved_mapping_that_does_not_fit_the_new_file_falls_back_to_the_suggestion(client, auth):
    """Found while preparing the demo: file 1 saves its mapping; file 2 has other column names and sent no mapping."""
    first = "Order No,Date,SKU,Item,Category,Qty,Unit Price,Customer,Cost Price\nB1,03/10/2026,P1,Pen,Office,2,10,C1,6\n"
    assert post(client, auth, first).status_code == 202
    second = "Order No,Date,SKU,Product,Qty,Unit Price,Customer\nB2,03/10/2026,P2,Cap,1,5,\n"
    r = post(client, auth, second)
    assert r.status_code == 202, r.text
    third = "Order No,Date,SKU,Item,Category,Qty,Unit Price,Customer,Cost Price\nB3,03/10/2026,P3,Mug,Home,1,7,C2,4\n"
    assert post(client, auth, third).status_code == 202                 # the newest saved mapping fits again


def test_templates_are_offered_for_all_four_types_need_a_login_and_map_completely(client, auth):
    """FR-UP-06: four templates; each one is a valid header the auto-suggest maps in full."""
    from app.mapping import FIELDS, suggest_mapping
    assert client.get("/uploads/template/sales").status_code == 401
    for kind in ("sales", "inventory", "expenses", "feedback"):
        r = client.get("/uploads/template/" + kind, headers=auth)
        assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
        header = r.text.strip().split(",")
        assert set(suggest_mapping(header, kind)) == set(FIELDS[kind]), kind
    assert client.get("/uploads/template/products", headers=auth).status_code == 404


def test_history_lists_only_my_jobs_newest_first_without_the_error_report(client, auth, conn):
    """FR-UP-04: GET /uploads is the upload history. Login needed; another business's jobs never appear."""
    assert client.get("/uploads").status_code == 401
    assert client.get("/uploads", headers=auth).json() == {"items": []}
    first = post(client, auth, name="one.csv").json()["job_id"]
    second = post(client, auth, GOOD.replace("A1", "Z1").replace("A2", "Z2"), name="two.csv").json()["job_id"]
    c = conn.cursor(); c.execute("insert into businesses(business_name) values('other') returning business_id"); other = c.fetchone()[0]; conn.commit()
    post(client, {"Authorization": "Bearer " + make_token(conn, other)}, name="theirs.csv")
    items = client.get("/uploads", headers=auth).json()["items"]
    assert [i["job_id"] for i in items] == [second, first]
    assert "error_report" not in items[0] and items[0]["file_name"] == "two.csv" and items[0]["status"] == "pending"
    assert len(client.get("/uploads?limit=1", headers=auth).json()["items"]) == 1
    assert client.get("/uploads?limit=0", headers=auth).status_code == 422


def test_sku_id_and_current_stock_headers_are_recognised():
    """The demo CSV headers sku_id / current_stock now map by themselves."""
    from app.mapping import suggest_mapping
    m = suggest_mapping(["sku_id", "product_name", "current_stock", "snapshot_date"], "inventory")
    assert m["product_code"] == "sku_id" and m["stock_quantity"] == "current_stock"

def test_sales_upload_missing_required_columns_is_rejected_with_422(client, auth):
    r = post(client, auth, "order_id,wrong_column\nA1,P1\n")   # sales is the default upload type
    assert r.status_code == 422
    assert "not mapped" in r.json()["detail"][0]