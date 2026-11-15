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
UP = ["001_create_core_tables.up.sql", "002_create_data_tables.up.sql", "003_create_indexes.up.sql"]

@pytest.fixture(scope="session", autouse=True)
def database(tmp_path_factory):
    os.environ.pop("PGDATABASE", None)
    a = psycopg2.connect(dbname="postgres"); a.autocommit = True
    a.cursor().execute("drop database if exists %s with (force)" % TEST_DB)
    a.cursor().execute("create database " + TEST_DB); a.close()
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

def make_token(business_id):
    import jwt
    return jwt.encode({"business_id": str(business_id), "sub": "test-user"}, os.environ["JWT_SECRET"], algorithm="HS256")
