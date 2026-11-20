"""P2-11: upload API and import job record.
POST /uploads/preview  -> columns + suggested/saved mapping for the mapping screen (P2-10, UC-03). Creates nothing.
POST /uploads          -> saves the file, creates the job (status pending), returns 202 + job_id at once (FR-UP-03).
GET  /uploads          -> history: this business's jobs, newest first, without the bad-row report (FR-UP-04)
GET  /uploads/template/{type} -> header-only CSV template for one upload type (FR-UP-06)
GET  /uploads/{id}     -> status, counts, message and the bad-row report of one job (FR-UP-04, FR-UP-09).
The business always comes from the JWT (FR-AUTH-03); another business's job is a 404."""
import hashlib
import json
import os
import datetime as dt
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse, Response
from . import cleaning as C, config
from .auth import current_business_id
from .billing import enforce_upload_limit
from .db import pool_connect, pool_release
from .mapping import FIELDS, REQUIRED, TEMPLATES, check_mapping, suggest_mapping

router = APIRouter(prefix="/uploads", tags=["uploads"])

def get_conn():
    conn = pool_connect()
    try:
        yield conn
    finally:
        pool_release(conn)

async def _read_checked(file: UploadFile, upload_type: str):
    """FR-UP-02: wrong type or too big is refused before anything is saved."""
    if upload_type not in config.UPLOAD_TYPES:
        raise HTTPException(422, "upload_type must be one of: " + ", ".join(config.UPLOAD_TYPES))
    if not (file.filename or "").lower().endswith(".csv"):
        raise HTTPException(415, "only .csv files are accepted")
    limit = config.MAX_UPLOAD_MB * 1024 * 1024
    raw = await file.read(limit + 1)
    if len(raw) > limit:
        raise HTTPException(413, "file is larger than %d MB" % config.MAX_UPLOAD_MB)
    return raw

def _head(raw: bytes):
    """Header check needs only the first lines, so the response stays fast for big files."""
    chunk = raw if len(raw) <= 262144 else raw[:262144].rsplit(b"\n", 1)[0] + b"\n"
    try:
        return C.read_csv(chunk)[0]
    except C.FileProblem as e:
        raise HTTPException(422, str(e))

def _saved_mapping(conn, biz, kind):
    cur = conn.cursor()
    cur.execute("select mapping from column_mappings where business_id=%s and upload_type=%s", (biz, kind))
    r = cur.fetchone()
    return r[0] if r else None

@router.post("/preview")
async def preview(file: UploadFile = File(...), upload_type: str = Form(...), biz: uuid.UUID = Depends(current_business_id), conn=Depends(get_conn)):
    raw = await _read_checked(file, upload_type)
    header = _head(raw)
    suggested = suggest_mapping(header, upload_type)
    saved = _saved_mapping(conn, biz, upload_type) or {}
    valid = {k: v for k, v in saved.items() if v in header}
    merged = {**suggested, **valid}
    return {"columns": header, "suggested_mapping": suggested,
            "saved_mapping": merged if valid else None, "fields": FIELDS[upload_type], "required": REQUIRED[upload_type],
            "needs_snapshot_date": upload_type == "inventory"}

@router.post("", status_code=202, dependencies=[Depends(enforce_upload_limit)])
async def create_upload(file: UploadFile = File(...), upload_type: str = Form(...), mapping: Optional[str] = Form(None),
                        snapshot_date: Optional[dt.date] = Form(None), on_duplicate: Optional[str] = Form(None),
                        biz: uuid.UUID = Depends(current_business_id), conn=Depends(get_conn)):
    raw = await _read_checked(file, upload_type)
    header = _head(raw)
    try:
        if mapping:
            chosen = json.loads(mapping)
        else:                                  # no mapping sent: the saved one if it still fits THIS file, else the suggestion
            saved = _saved_mapping(conn, biz, upload_type)
            fits = saved and not check_mapping(upload_type, saved, header, snapshot_date)
            chosen = saved if fits else suggest_mapping(header, upload_type)
        if not isinstance(chosen, dict):
            raise ValueError
    except ValueError:
        raise HTTPException(422, "mapping must be a JSON object {our_field: file_column}")
    problems = check_mapping(upload_type, chosen, header, snapshot_date)
    if problems:
        raise HTTPException(422, problems)
    file_hash = hashlib.sha256(raw + b"|" + str(snapshot_date).encode() + b"|" + upload_type.encode()).hexdigest()   # content, not name (FR-UP-08)
    cur = conn.cursor()
    cur.execute("select job_id from ingestion_jobs where business_id=%s and upload_type=%s and file_hash=%s and status like 'completed%%' order by created_at desc limit 1",
                (biz, upload_type, file_hash))
    prev = cur.fetchone()
    if prev and on_duplicate is None:
        return JSONResponse(status_code=409, content={"warning": "same_file_already_loaded", "existing_job_id": str(prev[0]), "choose": ["skip", "replace"]})
    if prev and on_duplicate == "skip":
        return JSONResponse(status_code=200, content={"status": "skipped", "existing_job_id": str(prev[0])})
    if prev and on_duplicate == "replace":
        raise HTTPException(501, "replace needs the job to remember which upload it replaces (open issue OI-9); pipeline.process_job(replace_job=...) is ready")
    job = uuid.uuid4()
    file_key = "%s.csv" % job                                            # where the original is kept (OI-8: local disk now, object storage later)
    cur.execute("""insert into ingestion_jobs(job_id,business_id,upload_type,file_name,file_hash,snapshot_date,status,file_key)
                   values(%s,%s,%s,%s,%s,%s,'pending',%s)""", (str(job), str(biz), upload_type, (file.filename or "upload.csv")[:255], file_hash, snapshot_date, file_key))
    cur.execute("""insert into column_mappings(business_id,upload_type,mapping) values(%s,%s,%s)
                   on conflict (business_id,upload_type) do update set mapping=excluded.mapping, updated_at=now()""", (str(biz), upload_type, json.dumps(chosen)))
    os.makedirs(config.UPLOAD_DIR, exist_ok=True)
    with open(os.path.join(config.UPLOAD_DIR, file_key), "wb") as f:       # original file kept (EI-07)
        f.write(raw)
    conn.commit()
    return {"job_id": str(job), "status": "pending"}

@router.get("")
def list_uploads(limit: int = Query(50, ge=1, le=200), biz: uuid.UUID = Depends(current_business_id), conn=Depends(get_conn)):
    """Upload history (FR-UP-04): this business's jobs, newest first. The bad-row report is not included (use GET /uploads/{id})."""
    cur = conn.cursor()
    cur.execute("""select job_id, upload_type, file_name, status, total_rows, loaded_rows, rejected_rows, skipped_rows, returned_rows, message, created_at, completed_at
                   from ingestion_jobs where business_id=%s order by created_at desc, job_id limit %s""", (str(biz), limit))
    keys = ["job_id", "upload_type", "file_name", "status", "total_rows", "loaded_rows", "rejected_rows", "skipped_rows", "returned_rows", "message", "created_at", "completed_at"]
    items = []
    for r in cur.fetchall():
        d = dict(zip(keys, r))
        d["job_id"] = str(d["job_id"])
        d["created_at"] = d["created_at"].isoformat()
        d["completed_at"] = d["completed_at"].isoformat() if d["completed_at"] else None
        items.append(d)
    return {"items": items}

@router.get("/template/{upload_type}")
def template(upload_type: str, biz: uuid.UUID = Depends(current_business_id)):
    """FR-UP-06: a header-only CSV the user can fill in. Needs a login like every other endpoint (FR-API-02)."""
    if upload_type not in TEMPLATES:
        raise HTTPException(404, "unknown upload type; use one of: " + ", ".join(config.UPLOAD_TYPES))
    return Response(",".join(TEMPLATES[upload_type]) + "\n", media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="scaleup_%s_template.csv"' % upload_type})

@router.get("/{job_id}")
def get_upload(job_id: uuid.UUID, biz: uuid.UUID = Depends(current_business_id), conn=Depends(get_conn)):
    cur = conn.cursor()
    cur.execute("""select job_id, upload_type, file_name, status, total_rows, loaded_rows, rejected_rows, skipped_rows, returned_rows, message, error_report, created_at, completed_at
                   from ingestion_jobs where job_id=%s and business_id=%s""", (str(job_id), str(biz)))
    r = cur.fetchone()
    if not r:
        raise HTTPException(404, "job not found")        # same answer for 'does not exist' and 'belongs to another business'
    keys = ["job_id", "upload_type", "file_name", "status", "total_rows", "loaded_rows", "rejected_rows", "skipped_rows", "returned_rows", "message", "error_report", "created_at", "completed_at"]
    out = dict(zip(keys, r))
    out["job_id"] = str(out["job_id"])
    out["created_at"] = out["created_at"].isoformat()
    out["completed_at"] = out["completed_at"].isoformat() if out["completed_at"] else None
    return out
