"""Super admin ("eagle view") ticket.
Covers: role-based 403s in both directions, a suspended/deactivated account rejected even with an
old token, admin CRUD happy paths over businesses/users/plans, the audit log, and the two
self-protection rules (an admin cannot deactivate themselves or the last active super admin)."""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import make_token

client = TestClient(app)


def admin_auth(conn):
    return {"Authorization": "Bearer " + make_token(conn, role="super_admin")}


def biz_auth(conn, biz):
    return {"Authorization": "Bearer " + make_token(conn, biz)}


# --------------------------------------------------------------- role 403s --

def test_business_user_cannot_use_admin_routes(conn, biz):
    auth = biz_auth(conn, biz)
    assert client.get("/admin/overview", headers=auth).status_code == 403
    assert client.get("/admin/businesses", headers=auth).status_code == 403
    assert client.get("/admin/jobs", headers=auth).status_code == 403


def test_admin_cannot_use_business_data_routes(conn):
    auth = admin_auth(conn)
    assert client.get("/uploads", headers=auth).status_code == 403
    assert client.get(
        "/analytics/sales", params={"start_date": "2026-01-01", "end_date": "2026-01-31"}, headers=auth
    ).status_code == 403


def test_no_token_on_admin_routes_is_401():
    assert client.get("/admin/overview").status_code == 401


# ------------------------------------------- suspended/deactivated + token --

def test_deactivated_user_with_old_token_is_rejected(conn, biz):
    auth = biz_auth(conn, biz)
    assert client.get("/uploads", headers=auth).status_code == 200          # the token works before deactivation

    cur = conn.cursor()
    cur.execute("UPDATE users SET is_active = false WHERE business_id = %s", (biz,))
    conn.commit()

    assert client.get("/uploads", headers=auth).status_code == 401         # same, still-unexpired token


def test_suspended_business_with_old_token_is_rejected(conn, biz):
    auth = biz_auth(conn, biz)
    assert client.get("/uploads", headers=auth).status_code == 200

    cur = conn.cursor()
    cur.execute("UPDATE businesses SET status = 'suspended' WHERE business_id = %s", (biz,))
    conn.commit()

    assert client.get("/uploads", headers=auth).status_code == 403


def test_deactivated_super_admin_with_old_token_is_rejected(conn):
    # A second admin exists so deactivating the first is not blocked by the last-admin rule.
    make_token(conn, role="super_admin")
    token = make_token(conn, role="super_admin")
    auth = {"Authorization": "Bearer " + token}
    assert client.get("/admin/overview", headers=auth).status_code == 200

    import jwt as pyjwt
    import os
    user_id = pyjwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])["sub"]
    cur = conn.cursor()
    cur.execute("UPDATE users SET is_active = false WHERE user_id = %s", (user_id,))
    conn.commit()

    assert client.get("/admin/overview", headers=auth).status_code == 401


# ------------------------------------------------------- existing isolation --
# tests/test_auth.py::test_user_never_sees_another_business_rows is untouched and still runs;
# this file does not duplicate it.


# --------------------------------------------------------------- businesses --

def test_business_crud_happy_path_and_audit_log(conn):
    auth = admin_auth(conn)

    created = client.post("/admin/businesses", json={"business_name": "  Acme   Traders  "}, headers=auth)
    assert created.status_code == 201
    body = created.json()
    assert body["business_name"] == "Acme Traders" and body["status"] == "active" and body["plan"] == "free"
    business_id = body["business_id"]

    found = client.get("/admin/businesses", params={"q": "acme"}, headers=auth).json()
    assert found["total"] == 1 and found["items"][0]["business_id"] == business_id

    got = client.get(f"/admin/businesses/{business_id}", headers=auth)
    assert got.status_code == 200 and got.json()["business_name"] == "Acme Traders"

    updated = client.patch(f"/admin/businesses/{business_id}", json={"status": "suspended"}, headers=auth)
    assert updated.status_code == 200
    assert updated.json()["status"] == "suspended" and updated.json()["business_name"] == "Acme Traders"

    reactivated = client.patch(f"/admin/businesses/{business_id}", json={"status": "active"}, headers=auth)
    assert reactivated.status_code == 200 and reactivated.json()["status"] == "active"

    plan = client.patch(f"/admin/businesses/{business_id}/plan", json={"plan": "pro"}, headers=auth)
    assert plan.status_code == 200 and plan.json()["plan"] == "pro"

    deleted = client.delete(f"/admin/businesses/{business_id}", headers=auth)
    assert deleted.status_code == 200 and deleted.json()["status"] == "suspended"      # soft delete only

    cur = conn.cursor()
    cur.execute(
        "SELECT action, target_type, target_id FROM admin_audit_log WHERE target_id = %s ORDER BY id",
        (business_id,),
    )
    rows = cur.fetchall()
    assert [r[0] for r in rows] == ["create", "update", "update", "set_plan", "soft_delete"]
    assert all(r[1] == "business" for r in rows)


def test_business_not_found_is_404(conn):
    auth = admin_auth(conn)
    missing = str(uuid.uuid4())
    assert client.get(f"/admin/businesses/{missing}", headers=auth).status_code == 404
    assert client.patch(f"/admin/businesses/{missing}", json={"status": "suspended"}, headers=auth).status_code == 404
    assert client.delete(f"/admin/businesses/{missing}", headers=auth).status_code == 404
    assert client.patch(f"/admin/businesses/{missing}/plan", json={"plan": "pro"}, headers=auth).status_code == 404


# -------------------------------------------------------------------- users --

def test_admin_creates_and_manages_a_business_user(conn, biz):
    auth = admin_auth(conn)

    created = client.post(
        "/admin/users", json={"business_id": str(biz), "email": "owner@acme.test", "password": "a-strong-pw1"},
        headers=auth,
    )
    assert created.status_code == 201
    user = created.json()
    assert user["email"] == "owner@acme.test" and user["role"] == "business_user" and user["is_active"] is True
    user_id = user["user_id"]

    login = client.post("/auth/login", json={"email": "owner@acme.test", "password": "a-strong-pw1"})
    assert login.status_code == 200 and login.json()["role"] == "business_user"

    listed = client.get("/admin/users", params={"business_id": str(biz)}, headers=auth).json()
    assert listed["total"] == 1 and listed["items"][0]["user_id"] == user_id

    deactivated = client.patch(f"/admin/users/{user_id}", json={"is_active": False}, headers=auth)
    assert deactivated.status_code == 200 and deactivated.json()["is_active"] is False

    blocked_login = client.post("/auth/login", json={"email": "owner@acme.test", "password": "a-strong-pw1"})
    assert blocked_login.status_code == 401                                    # deactivated: cannot log back in

    reset = client.patch(
        f"/admin/users/{user_id}", json={"is_active": True, "password": "a-new-strong-pw2"}, headers=auth
    )
    assert reset.status_code == 200 and reset.json()["is_active"] is True

    relogin = client.post("/auth/login", json={"email": "owner@acme.test", "password": "a-new-strong-pw2"})
    assert relogin.status_code == 200

    deleted = client.delete(f"/admin/users/{user_id}", headers=auth)
    assert deleted.status_code == 200 and deleted.json()["is_active"] is False

    cur = conn.cursor()
    cur.execute("SELECT action FROM admin_audit_log WHERE target_id = %s ORDER BY id", (user_id,))
    assert [r[0] for r in cur.fetchall()] == ["create", "update", "update", "soft_delete"]


def test_create_user_for_missing_business_is_404(conn):
    auth = admin_auth(conn)
    missing = str(uuid.uuid4())
    resp = client.post(
        "/admin/users", json={"business_id": missing, "email": "x@test.local", "password": "a-strong-pw1"},
        headers=auth,
    )
    assert resp.status_code == 404


def test_admin_cannot_deactivate_self(conn):
    token = make_token(conn, role="super_admin")
    auth = {"Authorization": "Bearer " + token}
    import jwt as pyjwt
    import os
    user_id = pyjwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])["sub"]

    resp = client.patch(f"/admin/users/{user_id}", json={"is_active": False}, headers=auth)
    assert resp.status_code == 400

    delete_resp = client.delete(f"/admin/users/{user_id}", headers=auth)
    assert delete_resp.status_code == 400


def test_cannot_deactivate_the_last_active_super_admin(conn):
    first_token = make_token(conn, role="super_admin")
    first_auth = {"Authorization": "Bearer " + first_token}
    second_token = make_token(conn, role="super_admin")

    import jwt as pyjwt
    import os
    first_id = pyjwt.decode(first_token, os.environ["JWT_SECRET"], algorithms=["HS256"])["sub"]
    second_id = pyjwt.decode(second_token, os.environ["JWT_SECRET"], algorithms=["HS256"])["sub"]

    # With two active admins, the first can deactivate the second.
    ok = client.patch(f"/admin/users/{second_id}", json={"is_active": False}, headers=first_auth)
    assert ok.status_code == 200

    # Now only `first_id` is active among these two; find any OTHER currently-active admin and
    # deactivate them first so this test is driven purely by count, not by which admin is targeted.
    cur = conn.cursor()
    cur.execute(
        "UPDATE users SET is_active = false WHERE role = 'super_admin' AND is_active AND user_id != %s",
        (first_id,),
    )
    conn.commit()

    blocked = client.patch(f"/admin/users/{first_id}", json={"is_active": False}, headers=first_auth)
    assert blocked.status_code == 400


def test_user_not_found_is_404(conn):
    auth = admin_auth(conn)
    missing = str(uuid.uuid4())
    assert client.patch(f"/admin/users/{missing}", json={"is_active": False}, headers=auth).status_code == 404
    assert client.delete(f"/admin/users/{missing}", headers=auth).status_code == 404


# ----------------------------------------------------------------- overview --

def test_overview_counts_only_no_raw_business_rows(conn, biz):
    auth = admin_auth(conn)
    body = client.get("/admin/overview", headers=auth).json()
    assert set(body.keys()) == {
        "businesses_by_status", "businesses_by_plan", "users_count",
        "jobs_last_7_days", "failed_jobs", "rows_loaded_per_business",
    }
    assert isinstance(body["users_count"], int)
    assert "active" in body["businesses_by_status"]


def test_recent_jobs_lists_across_businesses(conn, biz):
    auth = admin_auth(conn)
    body = client.get("/admin/jobs", headers=auth).json()
    assert "items" in body
