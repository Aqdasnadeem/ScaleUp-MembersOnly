"""P2-08-BE. Criteria: wrong password gives a clear 401 with no detail leak; a user never sees another business's rows.
Also FR-AUTH-01 (sign-up, duplicate email rejected), FR-AUTH-02 (JWT carries business_id), FR-AUTH-04 (salted hash only)."""
import datetime as dt
import uuid
import jwt
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.security import hash_password, verify_password
from tests.conftest import make_token

GOOD = "Order No,Date,SKU,Product,Qty,Unit Price,Customer\nA1,03/10/2026,P1,Pen,2,10,C1\n"

@pytest.fixture()
def client(): return TestClient(app)

def signup(client, name="Shop", email=None, pw="correct horse"):
    email = email or "u%s@example.com" % uuid.uuid4().hex[:8]
    r = client.post("/auth/signup", json={"business_name": name, "email": email, "password": pw})
    return email, pw, r

def test_signup_creates_one_business_and_one_user_and_returns_a_token(client, conn):
    email, pw, r = signup(client)
    assert r.status_code == 201
    claims = jwt.decode(r.json()["access_token"], options={"verify_signature": False})
    cur = conn.cursor(); cur.execute("select business_id from users where email=%s", (email,)); row = cur.fetchone()
    assert row and str(row[0]) == claims["business_id"] == r.json()["business_id"]
    cur.execute("select count(*) from businesses where business_id=%s", (row[0],)); assert cur.fetchone()[0] == 1

def test_duplicate_email_is_rejected_and_creates_no_second_business(client, conn):
    email, pw, r = signup(client)
    cur = conn.cursor(); cur.execute("select count(*) from businesses"); before = cur.fetchone()[0]; conn.commit()
    _, _, r2 = signup(client, email=email.upper())            # same address in capitals
    assert r2.status_code == 409
    cur.execute("select count(*) from businesses"); assert cur.fetchone()[0] == before

def test_password_is_stored_only_as_salted_hash(client, conn):
    email, pw, _ = signup(client)
    _, pw2, _ = signup(client, pw=pw)                          # same password for another user
    cur = conn.cursor(); cur.execute("select password_hash from users where email=%s", (email,)); h = cur.fetchone()[0]
    assert pw not in h and h.startswith("scrypt$") and verify_password(pw, h)
    cur.execute("select count(distinct password_hash) from users where password_hash like 'scrypt$%%'")
    assert cur.fetchone()[0] >= 2                              # same password, different hashes (salt)

def test_login_returns_a_token_with_business_id(client):
    email, pw, r = signup(client)
    ok = client.post("/auth/login", json={"email": email, "password": pw})
    assert ok.status_code == 200 and ok.json()["business_id"] == r.json()["business_id"]
    assert client.get("/auth/me", headers={"Authorization": "Bearer " + ok.json()["access_token"]}).json()["business_name"] == "Shop"

def test_wrong_password_is_401_and_gives_nothing_away(client):
    email, pw, _ = signup(client)
    wrong = client.post("/auth/login", json={"email": email, "password": "not the password"})
    unknown = client.post("/auth/login", json={"email": "nobody@example.com", "password": "whatever123"})
    print("\nwrong password  ->", wrong.status_code, wrong.json())
    print("unknown email   ->", unknown.status_code, unknown.json())
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == {"detail": "Incorrect email or password"}      # identical: no way to tell which part was wrong
    assert "access_token" not in wrong.text and "scrypt" not in wrong.text

def test_signup_validation_messages(client):
    assert client.post("/auth/signup", json={"business_name": "S", "email": "not-an-email", "password": "longenough1"}).status_code == 422
    assert client.post("/auth/signup", json={"business_name": "S", "email": "a@b.co", "password": "short"}).status_code == 422
    assert client.post("/auth/signup", json={"business_name": "  ", "email": "a@b.co", "password": "longenough1"}).status_code == 422

def test_no_token_bad_token_expired_token_all_401(client, biz):
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer abc.def.ghi"}).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer " + jwt.encode({"business_id": str(biz)}, "another-secret", algorithm="HS256")}).status_code == 401
    old = jwt.encode({"business_id": str(biz), "exp": dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=1)}, __import__("os").environ["JWT_SECRET"], algorithm="HS256")
    assert client.get("/auth/me", headers={"Authorization": "Bearer " + old}).status_code == 401

def test_user_never_sees_another_business_rows(client, conn):
    """FR-AUTH-03: A uploads; B (a real second account) cannot read, and a business_id sent in the request is ignored."""
    ea, pa, ra = signup(client, "Shop A"); eb, pb, rb = signup(client, "Shop B")
    ha = {"Authorization": "Bearer " + ra.json()["access_token"]}; hb = {"Authorization": "Bearer " + rb.json()["access_token"]}
    up = client.post("/uploads", headers=ha, files={"file": ("s.csv", GOOD.encode(), "text/csv")}, data={"upload_type": "sales"})
    assert up.status_code == 202; job = up.json()["job_id"]
    assert client.get("/uploads/" + job, headers=ha).status_code == 200
    assert client.get("/uploads/" + job, headers=hb).status_code == 404            # B cannot see A's job
    # B tries to push a file into A's account by sending A's business_id: the field is ignored, the job belongs to B
    sneaky = client.post("/uploads", headers=hb, files={"file": ("s2.csv", (GOOD + "A2,03/10/2026,P2,Cap,1,5,\n").encode(), "text/csv")},
                         data={"upload_type": "sales", "business_id": ra.json()["business_id"]})
    assert sneaky.status_code == 202
    cur = conn.cursor(); cur.execute("select business_id from ingestion_jobs where job_id=%s", (sneaky.json()["job_id"],))
    assert str(cur.fetchone()[0]) == rb.json()["business_id"]
    assert client.get("/uploads/" + sneaky.json()["job_id"], headers=ha).status_code == 404

def test_seed_placeholder_hash_can_never_log_in():
    assert verify_password("anything", "!placeholder-cannot-log-in") is False

def test_token_lifetime_is_60_minutes_or_less(client):
    """NFR-SEC-02."""
    email, pw, r = signup(client)
    c = jwt.decode(r.json()["access_token"], options={"verify_signature": False})
    assert 0 < c["exp"] - c["iat"] <= 60 * 60
