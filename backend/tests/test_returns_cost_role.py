"""Sir's rules of 5 Nov: returns counted apart (outside the 20% rule), a different cost is a warning and never an overwrite,
file_key on the job, no role column on users."""
import uuid
import pytest
import psycopg2
from decimal import Decimal
from fastapi.testclient import TestClient
from app.main import app
from app.pipeline import process_job
from tests.conftest import make_token
from tests.helpers import new_job, count

H = "Order No,Date,SKU,Product,Qty,Unit Price,Customer\n"
H_COST = "Order No,Date,SKU,Product,Qty,Unit Price,Customer,Cost Price\n"

def job_row(conn, job):
    c = conn.cursor(); c.execute("select status, total_rows, loaded_rows, rejected_rows, returned_rows, message from ingestion_jobs where job_id=%s", (job,))
    return c.fetchone()

# ---- returns
def test_returns_are_counted_apart_not_loaded_and_not_bad_rows(conn, biz):
    text = H + "A1,03/10/2026,P1,Pen,2,10,C1\nA2,03/10/2026,P2,Cap,-3,5,C2\nA3,03/10/2026,P1,Pen,-1,10,\n"
    j = new_job(conn, biz, "sales", text)
    r = process_job(conn, j)
    assert r["status"] == "completed" and r["loaded"] == 1 and r["returned"] == 2 and r["issues"] == []      # no warning status: a return is not a bad row
    status, total, loaded, rejected, returned, msg = job_row(conn, j)
    assert (total, loaded, rejected, returned) == (3, 1, 0, 2)
    assert "2 return lines" in msg and "value 25.00" in msg and "gross" in msg                                  # 3*5 + 1*10
    c = conn.cursor(); c.execute("select sum(total_amount) from sales where business_id=%s", (biz,)); assert c.fetchone()[0] == Decimal("20.00")   # gross revenue

def test_a_file_with_many_returns_does_not_fail_the_20_percent_rule(conn, biz):
    """1 bad row + 4 returns + 5 good: the old rule saw 5 bad of 10 = 50% -> failed. Now 1 bad of 6 non-return rows = 16.7% -> loads."""
    rows = "".join("G%d,03/10/2026,P%d,Item,1,10,\n" % (i, i) for i in range(5))
    rows += "".join("R%d,03/10/2026,P%d,Item,-1,10,\n" % (i, i) for i in range(4))
    rows += "B1,31/02/2026,P9,Item,1,10,\n"
    r = process_job(conn, new_job(conn, biz, "sales", H + rows))
    assert r["status"] == "completed_with_warnings" and r["loaded"] == 5 and r["returned"] == 4 and len(r["issues"]) == 1

def test_the_20_percent_rule_still_applies_to_the_other_rows(conn, biz):
    rows = "G1,03/10/2026,P1,Item,1,10,\n" + "B%d,31/02/2026,P2,Item,1,10,\n" % 1 + "R1,03/10/2026,P3,Item,-1,10,\n"
    r = process_job(conn, new_job(conn, biz, "sales", H + rows))                 # 1 bad of 2 non-return rows = 50%
    assert r["status"] == "failed" and count(conn, "sales", biz) == 0

def test_zero_quantity_is_still_a_bad_row(conn, biz):
    r = process_job(conn, new_job(conn, biz, "sales", H + "A1,03/10/2026,P1,Pen,0,10,\n" + "".join("G%d,03/10/2026,P1,Pen,1,10,\n" % i for i in range(9))))
    assert [(i.row, i.reason[:15]) for i in r["issues"]] == [(2, "must not be 0 (")] and r["returned"] == 0

def test_a_file_of_only_returns_loads_nothing_and_does_not_crash(conn, biz):
    j = new_job(conn, biz, "sales", H + "R1,03/10/2026,P1,Pen,-2,10,\n")
    r = process_job(conn, j)
    assert r["status"] == "completed" and r["loaded"] == 0 and job_row(conn, j)[4] == 1

# ---- cost_price
def test_a_different_cost_keeps_the_saved_one_and_warns(conn, biz):
    process_job(conn, new_job(conn, biz, "sales", H_COST + "A1,03/10/2026,P1,Pen,1,10,C1,4\nA2,03/10/2026,P2,Cap,1,10,C1,6\n"))
    j = new_job(conn, biz, "sales", H_COST + "B1,04/10/2026,P1,Pen,1,10,C1,5\nB2,04/10/2026,P2,Cap,1,10,C1,6\n")     # P1 differs, P2 the same
    r = process_job(conn, j)
    assert r["status"] == "completed" and "Warning: 1 products have a different cost" in r["message"] and "kept" in r["message"]
    c = conn.cursor(); c.execute("select product_key, cost_price from products where business_id=%s order by 1", (biz,))
    assert c.fetchall() == [("P1", Decimal("4.00")), ("P2", Decimal("6.00"))]                    # not overwritten

def test_no_warning_when_the_cost_is_the_same_or_new(conn, biz):
    process_job(conn, new_job(conn, biz, "sales", H_COST + "A1,03/10/2026,P1,Pen,1,10,C1,4\n"))
    r = process_job(conn, new_job(conn, biz, "sales", H_COST + "B1,04/10/2026,P1,Pen,1,10,C1,4\nB2,04/10/2026,P3,Mug,1,10,C1,7\n"))
    assert "Warning" not in (r["message"] or "")

# ---- file_key and users
@pytest.fixture()
def client(): return TestClient(app)

def test_the_job_remembers_where_its_file_is_kept(client, biz, conn):
    auth = {"Authorization": "Bearer " + make_token(biz)}
    job = client.post("/uploads", headers=auth, files={"file": ("s.csv", (H + "A1,03/10/2026,P1,Pen,1,10,\n").encode(), "text/csv")}, data={"upload_type": "sales"}).json()["job_id"]
    c = conn.cursor(); c.execute("select file_key from ingestion_jobs where job_id=%s", (job,))
    assert c.fetchone()[0] == job + ".csv"
    assert process_job(conn, uuid.UUID(job))["status"] == "completed"                            # the worker finds the file through file_key
    assert client.get("/uploads/" + job, headers=auth).json()["returned_rows"] == 0

def test_users_table_has_no_role_column(conn):
    c = conn.cursor(); c.execute("select 1 from information_schema.columns where table_name='users' and column_name='role'")
    assert c.fetchone() is None                                                                    # one role only in FYP-1 (sir, 5 Nov)

# ---- rejected_rows (sir, P2-07): one row per bad row, with row number, column and reason
def test_bad_rows_are_saved_in_rejected_rows_and_match_the_report(conn, biz):
    text = H + "".join("A%d,03/10/2026,P%d,Item %d,1,5,\n" % (i, i, i) for i in range(1, 7)) + "A7,not-a-date,P7,Cap,1,5,\n"
    job = new_job(conn, biz, "sales", text)
    r = process_job(conn, job)
    assert r["status"] == "completed_with_warnings"
    c = conn.cursor()
    c.execute("select row_number, column_name, reason from rejected_rows where job_id=%s order by row_number", (str(job),))
    rows = c.fetchall()
    assert len(rows) == 1 and rows[0][0] == 8 and rows[0][1] and rows[0][2]
    c.execute("select rejected_rows, error_report from ingestion_jobs where job_id=%s", (str(job),))
    n, rep = c.fetchone()
    assert n == len(rows) == len(rep) and rep[0]["row"] == rows[0][0]

def test_a_failed_file_also_keeps_its_bad_rows_and_a_good_file_has_none(conn, biz):
    bad = H + "".join("A%d,xx,P%d,Item,1,5,\n" % (i, i) for i in range(1, 6))       # all rows bad -> over 20% -> failed
    j1 = new_job(conn, biz, "sales", bad)
    assert process_job(conn, j1)["status"] == "failed"
    j2 = new_job(conn, biz, "sales", H + "B1,03/10/2026,Q1,Pen,1,5,\n")
    assert process_job(conn, j2)["status"] == "completed"
    c = conn.cursor()
    c.execute("select count(*) from rejected_rows where job_id=%s", (str(j1),)); assert c.fetchone()[0] == 5
    c.execute("select count(*) from rejected_rows where job_id=%s", (str(j2),)); assert c.fetchone()[0] == 0

def test_running_the_same_job_again_does_not_double_the_rejected_rows(conn, biz):
    text = H + "".join("A%d,03/10/2026,P%d,Item %d,1,5,\n" % (i, i, i) for i in range(1, 7)) + "A7,not-a-date,P7,Cap,1,5,\n"
    job = new_job(conn, biz, "sales", text)
    process_job(conn, job); process_job(conn, job)
    c = conn.cursor(); c.execute("select count(*) from rejected_rows where job_id=%s", (str(job),)); assert c.fetchone()[0] == 1
