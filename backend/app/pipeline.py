"""Puts the steps together for ONE job: read -> check mapping -> validate (P2-12) -> clean + merge (P2-13) -> bulk load (P2-14).
Used by the worker (app/worker.py, ticket P2-51). This function never retries: a bad CSV or bad data marks the job failed at once.
A TEMPORARY problem (lost database connection, deadlock) is raised as TemporaryFailure with everything rolled back, so the
worker can try again without leaving rows behind (sir, 4 Nov)."""
import json
import os
from decimal import Decimal
import sys
import psycopg2
from . import cleaning as C, config
from .mapping import check_mapping
from .schemas import validate_rows
from .transform import transform
from .loader import bulk_load, cost_conflicts, remove_job_rows

class TemporaryFailure(Exception):
    """The job itself is fine; the database (or network) had a problem. Worth another try."""

def _report(issues):
    return [i.model_dump() for i in issues[:config.ERROR_REPORT_MAX]]

def save_rejected(cur, job, issues):
    """Writes the bad rows into rejected_rows (row number, column, reason), at most ERROR_REPORT_MAX per job.
    Runs in the same transaction as the load; an earlier attempt's rows of the same job are removed first, so a retry never doubles them."""
    cur.execute("select business_id from ingestion_jobs where job_id=%s", (job,))
    biz = cur.fetchone()[0]
    cur.execute("delete from rejected_rows where job_id=%s", (job,))
    for i in list(issues)[:config.ERROR_REPORT_MAX]:
        cur.execute("insert into rejected_rows(business_id,job_id,row_number,column_name,reason) values(%s,%s,%s,%s,%s)",
                    (biz, job, i.row, (i.column or None) and i.column[:255], i.reason))

def _fail(conn, job, msg, total=0, issues=(), returned=0):
    cur = conn.cursor()
    save_rejected(cur, job, issues)
    cur.execute("update ingestion_jobs set status='failed', total_rows=%s, loaded_rows=0, rejected_rows=%s, returned_rows=%s, message=%s, error_report=%s, completed_at=now() where job_id=%s",
                (total, len(issues), returned, msg, json.dumps(_report(list(issues))), job))
    conn.commit()
    return dict(status="failed", job_id=job, loaded=0, skipped=0, returned=returned, issues=list(issues), message=msg)

def process_job(conn, job_id, replace_job=None):
    cur = conn.cursor()
    cur.execute("""select j.business_id, j.upload_type, j.snapshot_date, b.date_format
                   from ingestion_jobs j join businesses b using (business_id) where j.job_id=%s""", (job_id,))
    row = cur.fetchone()
    if not row:
        raise LookupError("job not found")
    biz, kind, snapshot, date_format = row
    cur.execute("select mapping from column_mappings where business_id=%s and upload_type=%s", (biz, kind))
    m = cur.fetchone()
    mapping = m[0] if m else {}
    cur.execute("update ingestion_jobs set status='processing' where job_id=%s", (job_id,))
    conn.commit()
    try:
        cur.execute("select file_key from ingestion_jobs where job_id=%s", (job_id,))
        file_key = cur.fetchone()[0] or "%s.csv" % job_id            # file_key: where the original file is kept (local disk now, object storage later; OI-8)
        raw = open(os.path.join(config.UPLOAD_DIR, file_key), "rb").read()
        header, norm, recs, warn = C.read_csv(raw)
    except (C.FileProblem, FileNotFoundError) as e:
        return _fail(conn, job_id, str(e) if isinstance(e, C.FileProblem) else "uploaded file is missing on the server")
    problems = check_mapping(kind, mapping, header, snapshot)
    if problems:
        return _fail(conn, job_id, "; ".join(problems))
    res = validate_rows(kind, header, norm, recs, mapping, date_format, snapshot)
    issues = list(res.issues)
    total = res.total_rows
    returned = res.returned
    base = total - returned                               # returns are not bad rows: they stay out of the 20% rule (sir, 5 Nov)
    limit_msg = "more than %d%% of rows are bad; nothing saved" % int(config.BAD_ROW_LIMIT * 100)
    if base and len(issues) / base > config.BAD_ROW_LIMIT:
        return _fail(conn, job_id, limit_msg, total, issues, returned)
    rows, extra, merged = transform(kind, res.good)
    issues += extra
    if base and len(issues) / base > config.BAD_ROW_LIMIT:
        return _fail(conn, job_id, limit_msg, total, issues, returned)
    try:                                                   # ---- one transaction: all or nothing (NFR-REL-01)
        if replace_job:
            remove_job_rows(cur, biz, kind, replace_job)
        conflicts = cost_conflicts(cur, biz, rows) if kind in ("sales", "inventory") else 0
        loaded = bulk_load(cur, biz, job_id, kind, rows)
        skipped = len(rows) - loaded
        notes = list(warn)
        if returned:
            notes.append("%d return lines (negative quantity, value %s) counted separately and not loaded; revenue is gross" % (returned, res.returned_value.quantize(Decimal("0.01"))))
        if conflicts:
            notes.append("Warning: %d products have a different cost in this file; the saved cost was kept" % conflicts)
        if skipped:
            notes.append("%d rows skipped: already saved earlier (duplicates are never overwritten)" % skipped)
        if merged:
            notes.append("%d repeated order+product lines merged" % merged)
        if kind == "feedback":
            cur.execute("select count(*) from feedback where job_id=%s and product_id is null", (job_id,))
            if cur.fetchone()[0] and any(r["pn"] for r in rows):
                notes.append("some feedback rows name a product that does not exist; saved without a product link")
        status = "completed_with_warnings" if issues else "completed"      # BR-12: only bad rows make a warning; skipped/merged lines are explained in the message
        save_rejected(cur, job_id, issues)
        cur.execute("update ingestion_jobs set status=%s, total_rows=%s, loaded_rows=%s, rejected_rows=%s, skipped_rows=%s, returned_rows=%s, message=%s, error_report=%s, completed_at=now() where job_id=%s",
                    (status, total, loaded, len(issues), skipped, returned, "; ".join(notes) or None, json.dumps(_report(issues)), job_id))
        conn.commit()
        return dict(status=status, job_id=job_id, loaded=loaded, skipped=skipped, returned=returned, issues=issues, message="; ".join(notes))
    except (psycopg2.OperationalError, psycopg2.InterfaceError) as e:   # lost connection, deadlock, server restart: temporary
        try: conn.rollback()
        except Exception: pass
        raise TemporaryFailure("%s: %s" % (type(e).__name__, str(e).splitlines()[0] if str(e) else ""))
    except Exception as e:                                 # nothing partial is left behind
        conn.rollback()
        return _fail(conn, job_id, "internal error: %s: %s" % (type(e).__name__, str(e).splitlines()[0]), total, issues)

if __name__ == "__main__":                                  # python -m app.pipeline <job_id>   (demo helper)
    from .db import connect
    c = connect()
    r = process_job(c, sys.argv[1])
    print({k: v for k, v in r.items() if k != "issues"}, "bad rows:", len(r["issues"]))
