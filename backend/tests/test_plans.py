"""Feature 2: plans (free/pro), the monthly upload quota, the per-file row limit, and the mock
checkout. business_id always comes from the JWT; a super admin never reaches /uploads at all
(current_business_id already 403s a super_admin token before enforce_upload_limit would run)."""
import datetime as dt
import uuid

from fastapi.testclient import TestClient

from app.main import app
from app.pipeline import process_job
from app.config import PLAN_LIMITS
from tests.conftest import make_token
from tests.helpers import new_job

client = TestClient(app)

H = "Order No,Date,SKU,Product,Qty,Unit Price,Customer\n"
GOOD = H + "A1,03/10/2026,P1,Pen,2,10,C1\nA2,03/10/2026,P2,Cap,1,5,\n"
BAD = H + "A1,03/10/2026,P1,Pen,2,10,C1\nA2,not-a-date,P2,Cap,1,5,C2\n"      # 1/2 rows bad -> fails the 20% rule


def auth_for(conn, biz):
    return {"Authorization": "Bearer " + make_token(conn, biz)}


def upload(client, auth, text=GOOD, name="sales.csv"):
    return client.post(
        "/uploads", headers=auth, files={"file": (name, text.encode(), "text/csv")}, data={"upload_type": "sales"}
    )


def test_upload_blocked_at_the_free_plan_monthly_limit(conn, biz):
    auth = auth_for(conn, biz)
    limit = PLAN_LIMITS["free"]["uploads_per_month"]
    for i in range(limit):
        # Distinct content each time (file_hash is content-based, FR-UP-08): same content would
        # trip the duplicate-file check (409) rather than the plan limit this test is about.
        text = H + "A%d,03/10/2026,P1,Pen,2,10,C1\n" % i
        response = upload(client, auth, text=text, name="good-%d.csv" % i)
        assert response.status_code == 202, response.text
        process_job(conn, uuid.UUID(response.json()["job_id"]))           # so it counts as this-month usage

    blocked = upload(client, auth, name="one-too-many.csv")
    assert blocked.status_code == 402
    assert blocked.json()["detail"] == {"code": "PLAN_LIMIT", "plan": "free", "limit": limit, "used": limit}


def test_failed_jobs_do_not_count_toward_the_quota(conn, biz):
    auth = auth_for(conn, biz)
    limit = PLAN_LIMITS["free"]["uploads_per_month"]
    for i in range(limit + 3):                                            # well over the limit, but every one fails
        response = upload(client, auth, text=BAD, name="bad-%d.csv" % i)
        assert response.status_code == 202
        result = process_job(conn, uuid.UUID(response.json()["job_id"]))
        assert result["status"] == "failed"

    still_allowed = upload(client, auth, name="finally-good.csv")
    assert still_allowed.status_code == 202


def test_admin_cannot_upload_at_all(conn):
    admin_auth = {"Authorization": "Bearer " + make_token(conn, role="super_admin")}
    assert upload(client, admin_auth).status_code == 403                  # current_business_id, not the plan check


def test_billing_me_reports_free_plan_and_usage(conn, biz):
    auth = auth_for(conn, biz)
    body = client.get("/billing/me", headers=auth).json()
    assert body["plan"] == "free"
    assert body["plan_expires_at"] is None
    assert body["limits"] == PLAN_LIMITS["free"]
    assert body["usage"]["uploads_this_month"] == 0

    response = upload(client, auth)
    process_job(conn, uuid.UUID(response.json()["job_id"]))
    assert client.get("/billing/me", headers=auth).json()["usage"]["uploads_this_month"] == 1


def test_expired_pro_plan_acts_as_free(conn, biz):
    auth = auth_for(conn, biz)
    cur = conn.cursor()
    cur.execute(
        "UPDATE businesses SET plan = 'pro', plan_expires_at = now() - interval '1 day' WHERE business_id = %s",
        (biz,),
    )
    conn.commit()

    body = client.get("/billing/me", headers=auth).json()
    assert body["plan"] == "free"
    assert body["limits"] == PLAN_LIMITS["free"]

    # A pro-only row count (over the free limit) is refused for an expired-pro business too.
    big_csv = H + "".join("A%d,03/10/2026,P%d,Item %d,1,5,C1\n" % (i, i, i) for i in range(PLAN_LIMITS["free"]["max_rows_per_file"] + 1))
    job = new_job(conn, biz, "sales", big_csv)
    result = process_job(conn, job)
    assert result["status"] == "failed"


def test_pro_plan_with_no_expiry_never_falls_back_to_free(conn, biz):
    cur = conn.cursor()
    cur.execute("UPDATE businesses SET plan = 'pro', plan_expires_at = NULL WHERE business_id = %s", (biz,))
    conn.commit()
    auth = auth_for(conn, biz)
    assert client.get("/billing/me", headers=auth).json()["plan"] == "pro"


def test_mock_checkout_upgrades_and_extends(conn, biz):
    auth = auth_for(conn, biz)

    first = client.post("/billing/checkout", headers=auth)
    assert first.status_code == 200
    body = first.json()
    assert body["plan"] == "pro"
    first_expiry = dt.datetime.fromisoformat(body["plan_expires_at"])
    now = dt.datetime.now(dt.timezone.utc)
    assert now + dt.timedelta(days=29) < first_expiry < now + dt.timedelta(days=31)

    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM payments WHERE business_id = %s AND status = 'paid'", (biz,))
    assert cur.fetchone()[0] == 1

    second = client.post("/billing/checkout", headers=auth)
    assert second.status_code == 200
    second_expiry = dt.datetime.fromisoformat(second.json()["plan_expires_at"])
    assert abs((second_expiry - first_expiry).total_seconds() - dt.timedelta(days=30).total_seconds()) < 5

    cur.execute("SELECT COUNT(*) FROM payments WHERE business_id = %s AND status = 'paid'", (biz,))
    assert cur.fetchone()[0] == 2


def test_checkout_requires_auth_and_admin_cannot_use_it(conn):
    assert client.post("/billing/checkout").status_code == 401
    admin_auth = {"Authorization": "Bearer " + make_token(conn, role="super_admin")}
    assert client.post("/billing/checkout", headers=admin_auth).status_code == 403


def test_worker_fails_an_oversize_file_at_once_with_no_rows_loaded(conn, biz):
    """business defaults to 'free' (10,000 rows/file); one row over that must fail, not partially load."""
    over_limit = PLAN_LIMITS["free"]["max_rows_per_file"] + 1
    big_csv = H + "".join("A%d,03/10/2026,P%d,Item %d,1,5,C1\n" % (i, i, i) for i in range(over_limit))
    job = new_job(conn, biz, "sales", big_csv)

    result = process_job(conn, job)

    assert result["status"] == "failed"
    assert result["loaded"] == 0
    assert "10000" in result["message"] and "free" in result["message"]

    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM sales WHERE job_id = %s", (job,))
    assert cur.fetchone()[0] == 0                                         # no partial load

    detail = client.get(
        "/uploads/%s" % job, headers=auth_for(conn, biz)
    ).json()
    assert detail["status"] == "failed" and detail["total_rows"] == over_limit and detail["loaded_rows"] == 0


def test_pro_business_can_upload_a_file_too_big_for_free(conn, biz):
    cur = conn.cursor()
    cur.execute("UPDATE businesses SET plan = 'pro' WHERE business_id = %s", (biz,))
    conn.commit()

    rows = PLAN_LIMITS["free"]["max_rows_per_file"] + 500
    big_csv = H + "".join("A%d,03/10/2026,P%d,Item %d,1,5,C1\n" % (i, i, i) for i in range(rows))
    job = new_job(conn, biz, "sales", big_csv)

    result = process_job(conn, job)

    assert result["status"] in ("completed", "completed_with_warnings")
    assert result["loaded"] == rows
