"""P2-51: background worker. Takes the next pending job, runs validate -> clean -> load (app/pipeline.py), retries TEMPORARY
failures (max 3 attempts) and marks the job completed / completed_with_warnings / failed.
  - A bad CSV or bad data fails at once (it would fail the same way 3 times): pipeline.process_job marks it failed.
  - Only a temporary problem (lost DB connection, deadlock) is retried. The load runs in one transaction, so a failed
    attempt leaves nothing behind, and the load itself skips rows that already exist: a retry cannot create duplicates.
  - After the last attempt the job is marked failed with a plain message.
Run:  py -m app.worker            (keeps running, polls every 2 s)      py -m app.worker --once   (one job, then stops)
Several workers may run: take_next_job uses FOR UPDATE SKIP LOCKED, so two workers never take the same job.
A worker that crashes leaves its job in 'processing'. Every worker puts such jobs back to 'pending' once they have been processing
longer than config.WORKER_STUCK_MINUTES (started_at), at start and before each look for work. The load is all-or-nothing and skips
rows that already exist, so running a recovered job again cannot duplicate anything."""
import sys
import time
import uuid
import psycopg2
from . import config
from .db import connect
from .pipeline import TemporaryFailure, process_job

TEMPORARY = (TemporaryFailure, psycopg2.OperationalError, psycopg2.InterfaceError)

def recover_stuck_jobs(conn, minutes=None) -> int:
    """Jobs 'processing' for longer than `minutes` were left by a crashed worker. Their load is all-or-nothing, so they are safe to run again.
    A job another live worker is still running is younger than the limit and is left alone."""
    minutes = config.WORKER_STUCK_MINUTES if minutes is None else minutes
    cur = conn.cursor()
    cur.execute("""update ingestion_jobs set status='pending', started_at=null
                   where status='processing' and (started_at is null or started_at < now() - make_interval(mins => %s))""", (minutes,))
    n = cur.rowcount; conn.commit()
    return n

def take_next_job(conn):
    """Oldest pending job, marked 'processing' in the same statement. SKIP LOCKED: two workers never take the same job."""
    cur = conn.cursor()
    cur.execute("""update ingestion_jobs set status='processing', started_at=now()
                   where job_id = (select job_id from ingestion_jobs where status='pending' order by created_at, job_id
                                   for update skip locked limit 1)
                   returning job_id""")
    row = cur.fetchone(); conn.commit()
    return row[0] if row else None

def _give_up(job_id, why):
    msg = "temporary problem, gave up after %d attempts (%s). Please upload the file again." % (config.WORKER_MAX_ATTEMPTS, why)
    try:
        c = connect()
        c.cursor().execute("update ingestion_jobs set status='failed', message=%s, completed_at=now() where job_id=%s", (msg, job_id))
        c.commit(); c.close()
    except Exception:
        pass                                   # database still down: the job stays 'processing' and is put back after the stuck-job limit
    return dict(status="failed", job_id=job_id, loaded=0, skipped=0, issues=[], message=msg)

def run_job(job_id, max_attempts=None, wait=None, sleep=time.sleep):
    """Process one job with retries for temporary failures. Returns the pipeline result dict."""
    max_attempts = max_attempts or config.WORKER_MAX_ATTEMPTS
    wait = config.WORKER_RETRY_WAIT_SECONDS if wait is None else wait
    why = ""
    for attempt in range(1, max_attempts + 1):
        conn = None
        try:
            conn = connect()
            result = process_job(conn, job_id)
            result["attempts"] = attempt
            return result
        except TEMPORARY as e:
            why = "%s" % (str(e).splitlines()[0] if str(e) else type(e).__name__)
            print("job %s attempt %d/%d: temporary failure: %s" % (job_id, attempt, max_attempts, why), flush=True)
            if attempt < max_attempts:
                sleep(wait * attempt)
        finally:
            if conn is not None:
                try: conn.close()
                except Exception: pass
    r = _give_up(job_id, why); r["attempts"] = max_attempts
    return r

def run_once(sleep=time.sleep):
    """Take and process one job. Returns the result, or None when no job is pending."""
    conn = connect()
    try:
        recover_stuck_jobs(conn)
        job = take_next_job(conn)
    finally:
        conn.close()
    return run_job(job, sleep=sleep) if job else None

def run_forever(poll=None):
    poll = config.WORKER_POLL_SECONDS if poll is None else poll
    c = connect(); n = recover_stuck_jobs(c); c.close()
    print("worker started; %d interrupted job(s) put back to pending" % n, flush=True)
    while True:
        try:
            r = run_once()
        except TEMPORARY as e:                 # cannot even reach the database to look for work
            print("database not reachable, waiting: %s" % str(e).splitlines()[0], flush=True)
            r = None
        if r:
            print("job %s -> %s (loaded %s, bad rows %s, attempts %s)" % (r["job_id"], r["status"], r["loaded"], len(r["issues"]), r["attempts"]), flush=True)
        else:
            time.sleep(poll)

if __name__ == "__main__":
    if "--once" in sys.argv:
        r = run_once()
        print("no pending job" if r is None else {k: v for k, v in r.items() if k != "issues"})
    else:
        run_forever()
