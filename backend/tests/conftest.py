"""Test setup. Needs PostgreSQL and the libpq variables PGHOST, PGPORT, PGUSER, PGPASSWORD.
Creates ONE database, scaleup_backend_test (dropped and rebuilt from the migrations in ../db), and never touches another."""
import os
import sys
import uuid
import pathlib
import pytest
import psycopg2

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import app.db  # noqa: E402,F401  (registers the UUID adapter)
os.environ.setdefault("JWT_SECRET", "test-secret-not-used-anywhere-else")
TEST_DB = "scaleup_backend_test"
MIGRATIONS = ROOT.parent / "db"
UP = ["001_create_core_tables.up.sql", "002_create_data_tables.up.sql", "003_create_indexes.up.sql",
      "004_create_indexes_rest.up.sql", "005_admin_and_plans.up.sql",
      "006_create_anomalies.up.sql"]        # 004/005 were missing from here (pre-existing gap); added for the admin ticket

@pytest.fixture(scope="session", autouse=True)
def database(tmp_path_factory):
    os.environ.pop("PGDATABASE", None)
    a = psycopg2.connect(dbname="postgres"); a.autocommit = True
    a.cursor().execute("drop database if exists %s with (force)" % TEST_DB)
    # Windows PostgreSQL clusters may default to a legacy code page that cannot store Unicode test data.
    a.cursor().execute("create database " + TEST_DB + " with template template0 encoding 'UTF8'"); a.close()
    c = psycopg2.connect(dbname=TEST_DB); c.autocommit = True
    for f in UP:
        c.cursor().execute((MIGRATIONS / f).read_text(encoding="utf-8"))
    c.close()
    os.environ["PGDATABASE"] = TEST_DB
    os.environ["UPLOAD_DIR"] = str(tmp_path_factory.mktemp("uploads"))
    from app import config
    config.UPLOAD_DIR = os.environ["UPLOAD_DIR"]
    yield
    os.environ.pop("PGDATABASE", None)

@pytest.fixture()
def conn(database):
    c = psycopg2.connect(dbname=TEST_DB)
    yield c
    c.close()

@pytest.fixture()
def biz(conn):
    """A fresh business per test, so tests never see each other's rows."""
    cur = conn.cursor()
    cur.execute("insert into businesses(business_name,date_format) values(%s,'DD/MM/YYYY') returning business_id", ("T-" + uuid.uuid4().hex[:8],))
    b = cur.fetchone()[0]; conn.commit()
    return b

def make_token(conn, business_id=None, role="business_user"):
    """Mint a token backed by a REAL users row (a fresh one each call), so current_business_id's and
    require_super_admin's is_active lookup finds a real user, not a fake sub. Old signature was
    make_token(business_id) with sub="test-user"; this is the one required change those checks need."""
    import jwt
    cur = conn.cursor()
    cur.execute(
        "insert into users(business_id, email, password_hash, role, is_active) "
        "values (%s, %s, '!fixture-no-login', %s, true) returning user_id",
        (business_id, "fixture-%s@test.invalid" % uuid.uuid4().hex, role),
    )
    user_id = cur.fetchone()[0]
    conn.commit()
    claims = {
        "sub": str(user_id),
        "business_id": str(business_id) if business_id else None,
        "role": role,
    }
    return jwt.encode(claims, os.environ["JWT_SECRET"], algorithm="HS256")
