"""P2-14: bulk load. Criteria: 10,000 rows in under 30 s; re-uploading the same file does not duplicate rows.
Also: merge before load (BR-18), exact revenue, nothing partial after a failure, replace by job id, retry safety."""
import time
import datetime as dt
from decimal import Decimal
from app.pipeline import process_job
from app import loader
from tests.helpers import new_job, count

H = "Order No,Date,SKU,Product,Qty,Unit Price,Customer\n"

def sales_file(n):
    return H + "".join("O%05d,%02d/09/2026,P%02d,Item %02d,%d,%d,C%03d\n" % (i, i % 28 + 1, i % 40, i % 40, i % 5 + 1, 50 + i % 7, i % 300) for i in range(n))

def test_10000_rows_under_30_seconds_and_no_duplicates_on_reupload(conn, biz):
    text = sales_file(10000)
    j1 = new_job(conn, biz, "sales", text)
    t0 = time.time(); r1 = process_job(conn, j1); secs = time.time() - t0
    print("\n10,000 rows: loaded %d in %.2f s" % (r1["loaded"], secs))
    assert r1["status"] == "completed" and r1["loaded"] == 10000 and secs < 30
    assert count(conn, "sales", biz) == 10000
    j2 = new_job(conn, biz, "sales", text)                      # the same file again
    r2 = process_job(conn, j2)
    assert r2["loaded"] == 0 and r2["skipped"] == 10000 and "skipped" in r2["message"]
    assert count(conn, "sales", biz) == 10000                    # no duplicate rows
    assert count(conn, "products", biz) == 40 and count(conn, "customers", biz) == 300

def test_repeated_lines_merge_with_weighted_average_and_exact_revenue(conn, biz):
    text = H + "A1,03/10/2026,P1,Pen,2,10,C1\nA1,03/10/2026,P1,Pen,3,20,C1\nA2,03/10/2026,P2,Cap,1,5,\n"
    r = process_job(conn, new_job(conn, biz, "sales", text))
    assert r["loaded"] == 2 and "1 repeated order+product lines merged" in r["message"]
    c = conn.cursor(); c.execute("select quantity, unit_price, total_amount from sales where business_id=%s and order_id='A1'", (biz,))
    q, up, tot = c.fetchone()
    assert (q, tot) == (5, Decimal("80.00")) and up == Decimal("16.00")          # (2*10 + 3*20) / 5
    c.execute("select sum(total_amount) from sales where business_id=%s", (biz,)); assert c.fetchone()[0] == Decimal("85.00")   # revenue = SUM(total), BR-20

def test_reupload_of_merged_file_does_not_double_quantities(conn, biz):
    text = H + "A1,03/10/2026,P1,Pen,2,10,C1\nA1,03/10/2026,P1,Pen,3,20,C1\n"
    process_job(conn, new_job(conn, biz, "sales", text)); process_job(conn, new_job(conn, biz, "sales", text))
    c = conn.cursor(); c.execute("select quantity from sales where business_id=%s", (biz,)); assert c.fetchall() == [(5,)]

def test_more_than_20_percent_bad_saves_nothing(conn, biz):
    text = H + "".join("X%d,31/02/2026,P,Pen,1,1,\n" % i for i in range(3)) + "".join("Y%d,03/10/2026,P,Pen,1,1,\n" % i for i in range(7))
    r = process_job(conn, new_job(conn, biz, "sales", text))                    # 3 of 10 = 30%
    assert r["status"] == "failed" and "more than 20%" in r["message"]
    assert count(conn, "sales", biz) == 0 and count(conn, "products", biz) == 0
    c = conn.cursor(); c.execute("select status, rejected_rows, jsonb_array_length(error_report) from ingestion_jobs where job_id=%s", (r["job_id"],))
    assert c.fetchone() == ("failed", 3, 3)

def test_exactly_20_percent_loads(conn, biz):
    text = H + "".join("X%d,31/02/2026,P,Pen,1,1,\n" % i for i in range(2)) + "".join("Y%d,03/10/2026,P,Pen,1,1,\n" % i for i in range(8))
    r = process_job(conn, new_job(conn, biz, "sales", text))
    assert r["status"] == "completed_with_warnings" and r["loaded"] == 8

def test_structural_errors_fail_at_once(conn, biz):
    for raw, why in ((b"a,b\n", "no data rows"), (b"PK\x03\x04zz", "not a CSV")):
        j = new_job(conn, biz, "sales", H + "A,03/10/2026,P,Pen,1,1,\n", mapping={"order_id": "Order No"})
        open(__import__("os").path.join(__import__("app.config", fromlist=["x"]).UPLOAD_DIR, "%s.csv" % j), "wb").write(raw)
        r = process_job(conn, j); assert r["status"] == "failed" and why in r["message"]

def test_failure_in_the_middle_leaves_no_partial_data(conn, biz, monkeypatch):
    text = sales_file(50)
    def boom(cur, b, j, k, rows): 
        loader._copy(cur, "create temp table stg(a int) on commit drop", [(1,)]); raise RuntimeError("database went away")
    monkeypatch.setattr("app.pipeline.bulk_load", boom)
    r = process_job(conn, new_job(conn, biz, "sales", text))
    assert r["status"] == "failed" and "internal error" in r["message"]
    assert count(conn, "sales", biz) == 0 and count(conn, "products", biz) == 0 and count(conn, "customers", biz) == 0

def test_retry_after_failure_adds_each_row_once(conn, biz, monkeypatch):
    text = sales_file(30)
    j = new_job(conn, biz, "sales", text)
    real = loader.bulk_load
    monkeypatch.setattr("app.pipeline.bulk_load", lambda *a: (_ for _ in ()).throw(RuntimeError("lost connection")))
    assert process_job(conn, j)["status"] == "failed"
    monkeypatch.setattr("app.pipeline.bulk_load", real)
    assert process_job(conn, j)["loaded"] == 30 and count(conn, "sales", biz) == 30     # P2-51 may retry; rows are not doubled
    assert process_job(conn, j)["loaded"] == 0 and count(conn, "sales", biz) == 30

def test_replace_removes_only_the_old_upload(conn, biz):
    a = process_job(conn, new_job(conn, biz, "sales", H + "A1,03/10/2026,P1,Pen,1,10,\nA2,03/10/2026,P1,Pen,1,10,\n"))
    other = process_job(conn, new_job(conn, biz, "sales", H + "B1,03/10/2026,P1,Pen,1,10,\n"))
    r = process_job(conn, new_job(conn, biz, "sales", H + "A1,03/10/2026,P1,Pen,1,12,\nA9,03/10/2026,P1,Pen,1,12,\n"), replace_job=a["job_id"])
    assert r["loaded"] == 2 and count(conn, "sales", biz) == 3                      # B1 (other upload) untouched
    c = conn.cursor(); c.execute("select status from ingestion_jobs where job_id=%s", (a["job_id"],)); assert c.fetchone()[0] == "replaced"
    c.execute("select unit_price from sales where business_id=%s and order_id='A1'", (biz,)); assert c.fetchone()[0] == Decimal("12.00")

def test_replace_refuses_another_business(conn, biz):
    c = conn.cursor(); c.execute("insert into businesses(business_name) values('other') returning business_id"); other = c.fetchone()[0]; conn.commit()
    j = process_job(conn, new_job(conn, other, "sales", H + "A1,03/10/2026,P1,Pen,1,10,\n"))
    r = process_job(conn, new_job(conn, biz, "sales", H + "A1,03/10/2026,P1,Pen,1,10,\n"), replace_job=j["job_id"])
    assert r["status"] == "failed" and "replace target" in r["message"]
    assert count(conn, "sales", other) == 1

def test_expenses_identical_rows_both_kept_and_reupload_adds_nothing(conn, biz):
    text = "Date,Category,Amount\n03/10/2026,Chai,500\n03/10/2026,Chai,500\n"
    assert process_job(conn, new_job(conn, biz, "expenses", text))["loaded"] == 2
    assert process_job(conn, new_job(conn, biz, "expenses", text))["loaded"] == 0 and count(conn, "expenses", biz) == 2

def test_inventory_history_and_snapshot_date(conn, biz):
    m = {"product_code": "SKU", "stock_quantity": "Stock"}
    process_job(conn, new_job(conn, biz, "inventory", "SKU,Stock\nP1,5\n", mapping=m, snapshot=dt.date(2026, 9, 1)))
    process_job(conn, new_job(conn, biz, "inventory", "SKU,Stock\nP1,3\n", mapping=m, snapshot=dt.date(2026, 9, 8)))
    assert count(conn, "inventory", biz) == 2                                        # history kept: product + snapshot_date

def test_cost_price_is_fill_only(conn, biz):
    base = "Order,Date,SKU,Qty,Price,Cost\n"
    process_job(conn, new_job(conn, biz, "sales", base + "A1,03/10/2026,P1,1,10,4\n"))
    process_job(conn, new_job(conn, biz, "sales", base + "A2,03/10/2026,P1,1,10,9\n"))
    c = conn.cursor(); c.execute("select cost_price from products where business_id=%s", (biz,)); assert c.fetchone()[0] == Decimal("4.00")

def test_feedback_links_known_product_only(conn, biz):
    process_job(conn, new_job(conn, biz, "sales", H + "A1,03/10/2026,P1,Pen,1,10,\n"))
    r = process_job(conn, new_job(conn, biz, "feedback", "Date,Review,Product\n03/10/2026,Nice,Pen\n03/10/2026,Fine,Ghost\n"))
    assert r["loaded"] == 2 and "does not exist" in r["message"]
