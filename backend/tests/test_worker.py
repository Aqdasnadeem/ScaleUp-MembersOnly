"""P2-51 worker. Sir's rules: take the next job, validate -> clean -> load, mark done / failed; retry ONLY temporary failures
(lost DB connection) at most 3 times; a bad CSV fails at once; a retry must not duplicate rows."""
import uuid
import psycopg2
import pytest
from app import pipeline, worker
from tests.helpers import count, new_job

H = "Order No,Date,SKU,Product,Qty,Unit Price,Customer\n"
GOOD = H + "".join("A%d,03/10/2026,P%d,Pen %d,2,10,C1\n" % (i, i, i) for i in range(1, 6))        # 5 rows

def make_job(client_post, text=GOOD):
    return client_post(text)

@pytest.fixture()
def submit(biz, conn):
    """Create a pending job the way POST /uploads does (row + file on disk)."""
    import os
    from app import config
    from tests.conftest import make_token
    from fastapi.testclient import TestClient
    from app.main import app
    c = TestClient(app); h = {"Authorization": "Bearer " + make_token(conn, biz)}
    def go(text=GOOD, name="s.csv"):
        r = c.post("/uploads", headers=h, files={"file": (name, text.encode(), "text/csv")}, data={"upload_type": "sales"})
        assert r.status_code == 202, r.text
        return uuid.UUID(r.json()["job_id"])
    return go

def status(conn, job):
    cur = conn.cursor(); cur.execute("select status, loaded_rows, message from ingestion_jobs where job_id=%s", (job,)); r = cur.fetchone(); conn.commit(); return r

def sales_rows(conn, job):
    cur = conn.cursor(); cur.execute("select count(*) from sales where job_id=%s", (job,)); n = cur.fetchone()[0]; conn.commit(); return n

def drain(conn):
    """Other tests may leave pending jobs; mark them failed so 'oldest first' tests only see their own."""
    conn.cursor().execute("update ingestion_jobs set status='failed' where status in ('pending','processing')"); conn.commit()

def test_takes_oldest_pending_job_first_and_marks_it_processing(conn, submit):
    drain(conn)
    first, second = submit(), submit(GOOD + "A9,04/10/2026,P9,Pen 9,1,5,C1\n")
    got = worker.take_next_job(conn)
    assert got == first and status(conn, first)[0] == "processing" and status(conn, second)[0] == "pending"
    assert worker.take_next_job(conn) == second            # a job is never handed out twice
    assert worker.take_next_job(conn) is None              # nothing pending

def test_worker_runs_a_job_end_to_end_and_marks_it_done(conn, submit):
    drain(conn)
    job = submit()
    r = worker.run_once()
    assert r["status"] == "completed" and r["attempts"] == 1
    assert status(conn, job)[:2] == ("completed", 5) and sales_rows(conn, job) == 5
    assert worker.run_once() is None                       # queue is empty now

def test_bad_csv_fails_at_once_without_retries(conn, submit, monkeypatch):
    drain(conn)
    calls = []
    real = pipeline.process_job
    monkeypatch.setattr(worker, "process_job", lambda c, j: (calls.append(j), real(c, j))[1])
    job = submit(H + "A1,03/10/2026,P1,Pen,2,10,C1\nA2,31/02/2026,P2,Cap,1,5,C1\nA3,not a date,P3,Mug,1,5,C1\n")   # 2 of 3 rows bad: more than 20%
    r = worker.run_once(sleep=lambda s: pytest.fail("must not wait: a bad CSV is not retried"))
    assert r["status"] == "failed" and r["attempts"] == 1 and len(calls) == 1
    assert status(conn, job)[0] == "failed" and sales_rows(conn, job) == 0

def test_missing_upload_file_fails_at_once_and_saves_nothing(conn, submit):
    import os
    from app import config
    drain(conn)
    job = submit(GOOD)                                   # upload passes, job is created
    os.remove(os.path.join(config.UPLOAD_DIR, "%s.csv" % job))   # worker cannot read the file
    r = worker.run_once(sleep=lambda s: pytest.fail("must not wait: an unreadable file is not retried"))
    assert r["status"] == "failed" and r["attempts"] == 1
    assert status(conn, job)[0] == "failed" and sales_rows(conn, job) == 0

def test_temporary_failure_is_retried_and_rows_are_not_duplicated(conn, submit, monkeypatch):
    """The load runs fully, THEN the connection 'drops' before commit (twice). Third attempt succeeds: exactly 5 rows."""
    drain(conn)
    state = {"n": 0}
    real_load = pipeline.bulk_load
    def flaky(cur, biz, job, kind, rows):
        n = real_load(cur, biz, job, kind, rows)
        state["n"] += 1
        if state["n"] <= 2:
            raise psycopg2.OperationalError("server closed the connection unexpectedly")
        return n
    monkeypatch.setattr(pipeline, "bulk_load", flaky)
    waits = []
    job = submit()
    r = worker.run_once(sleep=waits.append)
    assert r["status"] == "completed" and r["attempts"] == 3 and waits == [2, 4]
    assert sales_rows(conn, job) == 5                      # not 10, not 15
    assert status(conn, job)[:2] == ("completed", 5)

def test_gives_up_after_3_temporary_failures_and_leaves_no_rows(conn, submit, monkeypatch):
    drain(conn)
    state = {"n": 0}
    def always_down(cur, biz, job, kind, rows):
        state["n"] += 1
        raise psycopg2.OperationalError("connection refused")
    monkeypatch.setattr(pipeline, "bulk_load", always_down)
    job = submit()
    r = worker.run_once(sleep=lambda s: None)
    st = status(conn, job)
    print("\nafter 3 temporary failures:", st)
    assert state["n"] == 3 and r["status"] == "failed" and r["attempts"] == 3          # exactly 3 tries, not 4
    assert st[0] == "failed" and "gave up after 3 attempts" in st[2] and sales_rows(conn, job) == 0

def test_job_stuck_in_processing_is_put_back_only_after_the_limit(conn, submit):
    drain(conn)
    job = submit(); worker.take_next_job(conn)             # 'processing', then the worker "crashes"
    assert worker.recover_stuck_jobs(conn) == 0 and status(conn, job)[0] == "processing"      # young: maybe another worker is still on it
    c = conn.cursor(); c.execute("update ingestion_jobs set started_at = now() - interval '20 minutes' where job_id=%s", (str(job),)); conn.commit()
    assert worker.recover_stuck_jobs(conn) == 1 and status(conn, job)[0] == "pending"        # older than 15 min: crashed
    assert worker.run_once()["status"] == "completed"

def test_a_worker_that_looks_for_work_also_rescues_a_crashed_job(conn, submit):
    drain(conn)
    job = submit(); worker.take_next_job(conn)
    c = conn.cursor(); c.execute("update ingestion_jobs set started_at = now() - interval '1 hour' where job_id=%s", (str(job),)); conn.commit()
    r = worker.run_once()                                   # no restart needed
    assert r["job_id"] == job and r["status"] == "completed"

def test_two_workers_cannot_take_the_same_job(conn, submit):
    from app.db import connect
    drain(conn)
    j1 = submit(GOOD, "a.csv"); j2 = submit(GOOD.replace("A", "B"), "b.csv")
    other = connect()
    try:
        cur = other.cursor()          # worker 1 is in the middle of taking the oldest job: row locked, not yet committed
        cur.execute("select job_id from ingestion_jobs where status='pending' order by created_at, job_id for update skip locked limit 1")
        locked = cur.fetchone()[0]
        assert locked == j1
        got = worker.take_next_job(conn)                    # worker 2 must skip the locked row and take the next one, not wait or double-take
        assert got == j2
        other.rollback()
    finally:
        other.close()
    assert worker.take_next_job(conn) == j1 and worker.take_next_job(conn) is None

def test_after_a_take_the_same_job_is_not_offered_again(conn, submit):
    drain(conn)
    job = submit()
    assert worker.take_next_job(conn) == job and worker.take_next_job(conn) is None

def test_get_upload_shows_loaded_skipped_and_rejected(conn, submit, biz):
    from fastapi.testclient import TestClient
    from app.main import app
    from tests.conftest import make_token
    drain(conn)
    submit(H + "A1,03/10/2026,P1,Pen,2,10,C1\n", "one.csv"); worker.run_once()
    job = submit(H + "A1,03/10/2026,P1,Pen,2,10,C1\n" + "".join("A%d,03/10/2026,P%d,Item %d,1,5,C1\n" % (i, i, i) for i in range(2, 6)) + "A6,not-a-date,P6,Cap,1,5,C1\n", "two.csv")
    r = worker.run_once()
    assert r["status"] == "completed_with_warnings"
    body = TestClient(app).get("/uploads/%s" % job, headers={"Authorization": "Bearer " + make_token(conn, biz)}).json()
    assert (body["loaded_rows"], body["skipped_rows"], body["rejected_rows"]) == (4, 1, 1)
    assert body["total_rows"] == 6

# P2-29 (sir, 18 Nov): the worker runs anomaly detection for a job's business right after a
# successful load. 14 varying baseline days + 1 huge spike day, same shape as test_anomalies.py.
def spike_sales_csv():
    qtys = [1, 2, 3, 4] * 4
    rows = ["B%d,%02d/01/2026,P1,Pen,%d,10,C1" % (i, i + 1, qtys[i]) for i in range(14)]
    rows.append("SPIKE,29/01/2026,P1,Pen,50,10,C1")
    return H + "\n".join(rows) + "\n"

def test_worker_triggers_anomaly_detection_after_a_completed_load(conn, biz, submit):
    drain(conn)
    job = submit(spike_sales_csv())
    r = worker.run_once()
    assert r["status"] == "completed"
    cur = conn.cursor()
    cur.execute("select anomaly_type, metric_date, observed_value from anomalies where business_id=%s", (biz,))
    found = cur.fetchall(); conn.commit()
    assert len(found) == 1
    assert found[0][0] == "sales" and found[0][1].isoformat() == "2026-01-29" and float(found[0][2]) == 500.0

def test_detector_error_after_load_does_not_change_job_status(conn, submit, monkeypatch):
    drain(conn)
    monkeypatch.setattr(worker, "run_detection", lambda c, b: (_ for _ in ()).throw(RuntimeError("boom")))
    job = submit()
    r = worker.run_once()
    assert r["status"] == "completed"                      # the load result is unaffected by the detector failing
    assert status(conn, job)[0] == "completed"

def test_failed_job_does_not_trigger_anomaly_detection(conn, submit, monkeypatch):
    drain(conn)
    calls = []
    monkeypatch.setattr(worker, "run_detection", lambda c, b: calls.append(b))
    job = submit(H + "A1,03/10/2026,P1,Pen,2,10,C1\nA2,31/02/2026,P2,Cap,1,5,C1\nA3,not a date,P3,Mug,1,5,C1\n")   # 2 of 3 rows bad: more than 20%
    r = worker.run_once(sleep=lambda s: pytest.fail("must not wait: a bad CSV is not retried"))
    assert r["status"] == "failed"
    assert calls == []