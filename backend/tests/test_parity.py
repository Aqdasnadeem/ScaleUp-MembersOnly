"""Safety net for the refactor: the new modules (P2-12/13/14) must give the SAME answer as the prototype etl.py that the 66 schema tests
were written against, on every CSV in tests/data of the prototype. Needs the prototype folder: ../../tests (in the package)."""
import glob
import os
import sys
import datetime as dt
import pytest

PROTO = os.path.join(os.path.dirname(__file__), "..", "..", "tests")
if not os.path.exists(os.path.join(PROTO, "etl.py")):
    pytest.skip("prototype folder not found", allow_module_level=True)
sys.path.insert(0, PROTO)
import etl  # noqa: E402
from app import config
from app.mapping import suggest_mapping
from app.pipeline import process_job

def kind_of(name):
    n = os.path.basename(name).lower()
    if n.startswith("exp"): return "expenses"
    if n.startswith("fb"): return "feedback"
    if n.startswith("inv"): return "inventory"
    return "sales"

FILES = sorted(glob.glob(os.path.join(PROTO, "data", "*.csv")))

@pytest.mark.parametrize("path", FILES, ids=[os.path.basename(p) for p in FILES])
def test_same_result_as_prototype(conn, path):
    kind = kind_of(path)
    cur = conn.cursor()
    ids = []
    for _ in range(2):
        cur.execute("insert into businesses(business_name,date_format) values('P','DD/MM/YYYY') returning business_id"); ids.append(cur.fetchone()[0])
    conn.commit()
    snap = dt.date(2026, 9, 1) if kind == "inventory" else None
    try: hdr = etl.read_file(path)[1]
    except etl.FileError: hdr = None
    if hdr is None:
        pytest.skip("not a readable CSV (prototype refuses it too)")
    mapping = suggest_mapping(hdr, kind)
    old = etl.load(conn, ids[0], kind, path, mapping, "DD/MM/YYYY", snapshot=snap)
    # new pipeline: create the job the way the API does
    cur.execute("insert into column_mappings(business_id,upload_type,mapping) values(%s,%s,%s)", (ids[1], kind, __import__("json").dumps(mapping)))
    cur.execute("insert into ingestion_jobs(business_id,upload_type,file_name,file_hash,snapshot_date,status) values(%s,%s,'x.csv',repeat('a',64),%s,'pending') returning job_id", (ids[1], kind, snap))
    job = cur.fetchone()[0]; conn.commit()
    open(os.path.join(config.UPLOAD_DIR, "%s.csv" % job), "wb").write(open(path, "rb").read())
    new = process_job(conn, job)
    # Two deliberate differences from the prototype:
    # 1. (5 Nov, BR-12) the prototype also warned for notes (skipped / merged / encoding); now only a rejected row makes a warning.
    # 2. (5 Nov, sir) a NEGATIVE quantity is a return: counted apart, not a bad row. The prototype rejected it as "returns are not supported yet".
    RET = "must be more than 0 (returns are not supported yet)"
    drop = new["returned"]
    old_bad = []
    for b in sorted(old["bad"]):
        if b[2] == RET and drop > 0:
            drop -= 1
            continue
        old_bad.append(b)
    if old["status"] == "failed" and new["returned"]:
        pytest.skip("the prototype failed this file on its 20% rule counting returns as bad rows; the new rule excludes them (tested in test_returns.py)")
    expected = "failed" if old["status"] == "failed" else ("completed_with_warnings" if old_bad else "completed")
    assert new["status"] == expected
    assert new["loaded"] == old["loaded"]
    NEW_ZERO = "must not be 0 (a return is a negative quantity)"            # reworded on 5 Nov; same rule for a quantity of 0
    assert sorted((i.row, i.column, RET if i.reason == NEW_ZERO else i.reason) for i in new["issues"]) == sorted((r, c, why) for r, c, why in old_bad)
    for t in ("sales", "inventory", "expenses", "feedback", "products", "customers"):
        cur.execute("select count(*) from " + t + " where business_id=%s", (ids[0],)); a = cur.fetchone()[0]
        cur.execute("select count(*) from " + t + " where business_id=%s", (ids[1],)); b = cur.fetchone()[0]
        assert a == b, t
    cur.execute("select coalesce(sum(total_amount),0) from sales where business_id=%s", (ids[0],)); x = cur.fetchone()[0]
    cur.execute("select coalesce(sum(total_amount),0) from sales where business_id=%s", (ids[1],)); y = cur.fetchone()[0]
    assert x == y
