import json
import os
from app import config

def new_job(conn, biz, kind, text, mapping=None, snapshot=None, name="x.csv"):
    """Does what POST /uploads does (job row + saved file + saved mapping) so loader/pipeline tests need no HTTP."""
    from app import cleaning as C
    from app.mapping import suggest_mapping
    raw = text.encode() if isinstance(text, str) else text
    cur = conn.cursor()
    mapping = mapping or suggest_mapping(C.read_csv(raw)[0], kind)
    cur.execute("insert into column_mappings(business_id,upload_type,mapping) values(%s,%s,%s) on conflict (business_id,upload_type) do update set mapping=excluded.mapping",
                (biz, kind, json.dumps(mapping)))
    cur.execute("insert into ingestion_jobs(business_id,upload_type,file_name,file_hash,snapshot_date,status) values(%s,%s,%s,repeat('a',64),%s,'pending') returning job_id",
                (biz, kind, name, snapshot))
    job = cur.fetchone()[0]; conn.commit()
    open(os.path.join(config.UPLOAD_DIR, "%s.csv" % job), "wb").write(raw)
    return job

def count(conn, table, biz):
    c = conn.cursor(); c.execute("select count(*) from " + table + " where business_id=%s", (biz,)); return c.fetchone()[0]
