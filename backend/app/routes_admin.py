"""Super admin ("eagle view") CRUD over businesses, users and plans, plus a platform overview.
Every route here requires `require_super_admin` (role=super_admin, is_active) and never reads
business-scoped detail rows (sales/customers/feedback/...), only counts, per the ticket's scope.
Every write appends one row to admin_audit_log (admin_user_id, action, target_type, target_id, details)."""
import json
import re
import uuid

import psycopg2.errors
from fastapi import APIRouter, Depends, HTTPException, Path, Query
from pydantic import BaseModel, Field, field_validator

from .auth import _conn, require_super_admin
from .billing import effective_plan
from .security import hash_password

router = APIRouter(prefix="/admin", tags=["admin"])

_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _audit(conn, admin_user_id, action, target_type, target_id=None, details=None):
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO admin_audit_log(admin_user_id, action, target_type, target_id, details) "
        "VALUES (%s, %s, %s, %s, %s)",
        (admin_user_id, action, target_type, str(target_id) if target_id is not None else None,
         json.dumps(details) if details is not None else None),
    )


def _active_super_admin_count(conn) -> int:
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM users WHERE role = 'super_admin' AND is_active")
    return cur.fetchone()[0]


# ---------------------------------------------------------------- overview --

@router.get("/overview")
def overview(admin_id: uuid.UUID = Depends(require_super_admin), conn=Depends(_conn)):
    cur = conn.cursor()
    cur.execute("SELECT status, COUNT(*) FROM businesses GROUP BY status")
    businesses_by_status = {status: count for status, count in cur.fetchall()}
    cur.execute("SELECT plan, COUNT(*) FROM businesses GROUP BY plan")
    businesses_by_plan = {plan: count for plan, count in cur.fetchall()}
    cur.execute("SELECT COUNT(*) FROM users")
    users_count = cur.fetchone()[0]
    cur.execute(
        "SELECT status, COUNT(*) FROM ingestion_jobs WHERE created_at >= now() - interval '7 days' GROUP BY status"
    )
    jobs_last_7_days = {status: count for status, count in cur.fetchall()}
    cur.execute("SELECT COUNT(*) FROM ingestion_jobs WHERE status = 'failed'")
    failed_jobs = cur.fetchone()[0]
    cur.execute("SELECT business_id, COALESCE(SUM(loaded_rows), 0) FROM ingestion_jobs GROUP BY business_id")
    rows_loaded_per_business = {str(business_id): rows for business_id, rows in cur.fetchall()}
    return {
        "businesses_by_status": businesses_by_status,
        "businesses_by_plan": businesses_by_plan,
        "users_count": users_count,
        "jobs_last_7_days": jobs_last_7_days,
        "failed_jobs": failed_jobs,
        "rows_loaded_per_business": rows_loaded_per_business,
    }


# -------------------------------------------------------------- businesses --

class BusinessCreate(BaseModel):
    business_name: str = Field(min_length=1, max_length=255)

    @field_validator("business_name")
    @classmethod
    def _name(cls, v):
        v = " ".join(v.split())
        if not v:
            raise ValueError("business name is required")
        return v


class BusinessUpdate(BaseModel):
    business_name: str | None = Field(default=None, min_length=1, max_length=255)
    status: str | None = None

    @field_validator("status")
    @classmethod
    def _status(cls, v):
        if v is not None and v not in ("active", "suspended"):
            raise ValueError("status must be active or suspended")
        return v


class PlanUpdate(BaseModel):
    plan: str

    @field_validator("plan")
    @classmethod
    def _plan(cls, v):
        if v not in ("free", "pro"):
            raise ValueError("plan must be free or pro")
        return v


def _business_row(row):
    business_id, name, status, plan, plan_expires_at, created_at = row
    return {
        "business_id": str(business_id),
        "business_name": name,
        "status": status,
        "plan": effective_plan(plan, plan_expires_at),       # effective, not the raw stored column (Feature 2)
        "stored_plan": plan,
        "plan_expires_at": plan_expires_at.isoformat() if plan_expires_at else None,
        "created_at": created_at.isoformat(),
    }


@router.get("/businesses")
def list_businesses(
    q: str = Query(default="", max_length=255),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin_id: uuid.UUID = Depends(require_super_admin),
    conn=Depends(_conn),
):
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM businesses WHERE business_name ILIKE %s", ("%" + q + "%",))
    total = cur.fetchone()[0]
    cur.execute(
        "SELECT business_id, business_name, status, plan, plan_expires_at, created_at FROM businesses "
        "WHERE business_name ILIKE %s ORDER BY created_at DESC LIMIT %s OFFSET %s",
        ("%" + q + "%", limit, offset),
    )
    return {"total": total, "limit": limit, "offset": offset, "items": [_business_row(r) for r in cur.fetchall()]}


@router.get("/businesses/{business_id}")
def get_business(
    business_id: uuid.UUID,
    admin_id: uuid.UUID = Depends(require_super_admin),
    conn=Depends(_conn),
):
    cur = conn.cursor()
    cur.execute(
        "SELECT business_id, business_name, status, plan, plan_expires_at, created_at "
        "FROM businesses WHERE business_id = %s",
        (business_id,),
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(404, "business not found")
    return _business_row(row)


@router.post("/businesses", status_code=201)
def create_business(
    body: BusinessCreate,
    admin_id: uuid.UUID = Depends(require_super_admin),
    conn=Depends(_conn),
):
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO businesses(business_name) VALUES (%s) "
        "RETURNING business_id, business_name, status, plan, plan_expires_at, created_at",
        (body.business_name,),
    )
    row = cur.fetchone()
    _audit(conn, admin_id, "create", "business", row[0], {"business_name": body.business_name})
    conn.commit()
    return _business_row(row)


@router.patch("/businesses/{business_id}")
def update_business(
    body: BusinessUpdate,
    business_id: uuid.UUID = Path(...),
    admin_id: uuid.UUID = Depends(require_super_admin),
    conn=Depends(_conn),
):
    cur = conn.cursor()
    cur.execute("SELECT business_name, status FROM businesses WHERE business_id = %s", (business_id,))
    current = cur.fetchone()
    if current is None:
        raise HTTPException(404, "business not found")

    name = body.business_name if body.business_name is not None else current[0]
    status = body.status if body.status is not None else current[1]
    cur.execute(
        "UPDATE businesses SET business_name = %s, status = %s WHERE business_id = %s "
        "RETURNING business_id, business_name, status, plan, plan_expires_at, created_at",
        (name, status, business_id),
    )
    row = cur.fetchone()
    _audit(conn, admin_id, "update", "business", business_id, body.model_dump(exclude_none=True))
    conn.commit()
    return _business_row(row)


@router.delete("/businesses/{business_id}", status_code=200)
def delete_business(
    business_id: uuid.UUID,
    admin_id: uuid.UUID = Depends(require_super_admin),
    conn=Depends(_conn),
):
    """Soft delete only: sets status = suspended. There is no hard delete (the schema's foreign
    keys from sales/inventory/etc. to businesses have no ON DELETE action, so a hard delete would
    fail anyway once the business has any data)."""
    cur = conn.cursor()
    cur.execute(
        "UPDATE businesses SET status = 'suspended' WHERE business_id = %s "
        "RETURNING business_id, business_name, status, plan, plan_expires_at, created_at",
        (business_id,),
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(404, "business not found")
    _audit(conn, admin_id, "soft_delete", "business", business_id)
    conn.commit()
    return _business_row(row)


@router.patch("/businesses/{business_id}/plan")
def update_plan(
    body: PlanUpdate,
    business_id: uuid.UUID = Path(...),
    admin_id: uuid.UUID = Depends(require_super_admin),
    conn=Depends(_conn),
):
    cur = conn.cursor()
    cur.execute(
        "UPDATE businesses SET plan = %s, plan_expires_at = NULL WHERE business_id = %s "
        "RETURNING business_id, business_name, status, plan, plan_expires_at, created_at",
        (body.plan, business_id),
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(404, "business not found")
    _audit(conn, admin_id, "set_plan", "business", business_id, {"plan": body.plan})
    conn.commit()
    return _business_row(row)


# -------------------------------------------------------------------- users --

class AdminUserCreate(BaseModel):
    business_id: uuid.UUID
    email: str = Field(max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        v = v.strip().lower()
        if not _EMAIL.match(v):
            raise ValueError("enter a valid email address")
        return v


class AdminUserUpdate(BaseModel):
    email: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        if v is None:
            return v
        v = v.strip().lower()
        if not _EMAIL.match(v):
            raise ValueError("enter a valid email address")
        return v


def _user_row(row):
    user_id, business_id, email, role, is_active, created_at = row
    return {
        "user_id": str(user_id),
        "business_id": str(business_id) if business_id else None,
        "email": email,
        "role": role,
        "is_active": is_active,
        "created_at": created_at.isoformat(),
    }


@router.get("/users")
def list_users(
    business_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    admin_id: uuid.UUID = Depends(require_super_admin),
    conn=Depends(_conn),
):
    cur = conn.cursor()
    if business_id is not None:
        cur.execute("SELECT COUNT(*) FROM users WHERE business_id = %s", (business_id,))
        total = cur.fetchone()[0]
        cur.execute(
            "SELECT user_id, business_id, email, role, is_active, created_at FROM users "
            "WHERE business_id = %s ORDER BY created_at DESC LIMIT %s OFFSET %s",
            (business_id, limit, offset),
        )
    else:
        cur.execute("SELECT COUNT(*) FROM users")
        total = cur.fetchone()[0]
        cur.execute(
            "SELECT user_id, business_id, email, role, is_active, created_at FROM users "
            "ORDER BY created_at DESC LIMIT %s OFFSET %s",
            (limit, offset),
        )
    return {"total": total, "limit": limit, "offset": offset, "items": [_user_row(r) for r in cur.fetchall()]}


@router.post("/users", status_code=201)
def create_user(
    body: AdminUserCreate,
    admin_id: uuid.UUID = Depends(require_super_admin),
    conn=Depends(_conn),
):
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM businesses WHERE business_id = %s", (body.business_id,))
    if cur.fetchone() is None:
        raise HTTPException(404, "business not found")
    try:
        cur.execute(
            "INSERT INTO users(business_id, email, password_hash, role) VALUES (%s, %s, %s, 'business_user') "
            "RETURNING user_id, business_id, email, role, is_active, created_at",
            (body.business_id, body.email, hash_password(body.password)),
        )
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(409, "this email is already registered")
    row = cur.fetchone()
    _audit(conn, admin_id, "create", "user", row[0], {"business_id": str(body.business_id), "email": body.email})
    conn.commit()
    return _user_row(row)


@router.patch("/users/{user_id}")
def update_user(
    body: AdminUserUpdate,
    user_id: uuid.UUID = Path(...),
    admin_id: uuid.UUID = Depends(require_super_admin),
    conn=Depends(_conn),
):
    cur = conn.cursor()
    cur.execute("SELECT business_id, email, role, is_active FROM users WHERE user_id = %s", (user_id,))
    current = cur.fetchone()
    if current is None:
        raise HTTPException(404, "user not found")
    current_business_id, current_email, role, current_is_active = current

    if body.is_active is False:
        if user_id == admin_id:
            raise HTTPException(400, "you cannot deactivate your own account")
        if role == "super_admin" and current_is_active and _active_super_admin_count(conn) <= 1:
            raise HTTPException(400, "cannot deactivate the last active super admin")

    email = body.email if body.email is not None else current_email
    is_active = body.is_active if body.is_active is not None else current_is_active
    password_hash = hash_password(body.password) if body.password is not None else None

    try:
        if password_hash is not None:
            cur.execute(
                "UPDATE users SET email = %s, is_active = %s, password_hash = %s WHERE user_id = %s "
                "RETURNING user_id, business_id, email, role, is_active, created_at",
                (email, is_active, password_hash, user_id),
            )
        else:
            cur.execute(
                "UPDATE users SET email = %s, is_active = %s WHERE user_id = %s "
                "RETURNING user_id, business_id, email, role, is_active, created_at",
                (email, is_active, user_id),
            )
    except psycopg2.errors.UniqueViolation:
        conn.rollback()
        raise HTTPException(409, "this email is already registered")
    row = cur.fetchone()
    _audit(
        conn, admin_id, "update", "user", user_id,
        {k: v for k, v in {"email": body.email, "is_active": body.is_active,
                            "password_reset": body.password is not None}.items() if v is not None},
    )
    conn.commit()
    return _user_row(row)


@router.delete("/users/{user_id}", status_code=200)
def delete_user(
    user_id: uuid.UUID,
    admin_id: uuid.UUID = Depends(require_super_admin),
    conn=Depends(_conn),
):
    """Soft delete only: sets is_active = false. No hard delete (keeps the row's history intact)."""
    cur = conn.cursor()
    cur.execute("SELECT role, is_active FROM users WHERE user_id = %s", (user_id,))
    current = cur.fetchone()
    if current is None:
        raise HTTPException(404, "user not found")
    role, is_active = current

    if user_id == admin_id:
        raise HTTPException(400, "you cannot deactivate your own account")
    if role == "super_admin" and is_active and _active_super_admin_count(conn) <= 1:
        raise HTTPException(400, "cannot deactivate the last active super admin")

    cur.execute(
        "UPDATE users SET is_active = false WHERE user_id = %s "
        "RETURNING user_id, business_id, email, role, is_active, created_at",
        (user_id,),
    )
    row = cur.fetchone()
    _audit(conn, admin_id, "soft_delete", "user", user_id)
    conn.commit()
    return _user_row(row)


# -------------------------------------------------------------------- jobs --

@router.get("/jobs")
def recent_jobs(
    limit: int = Query(default=50, ge=1, le=200),
    admin_id: uuid.UUID = Depends(require_super_admin),
    conn=Depends(_conn),
):
    cur = conn.cursor()
    cur.execute(
        "SELECT job_id, business_id, upload_type, status, message, total_rows, loaded_rows, "
        "rejected_rows, skipped_rows, created_at FROM ingestion_jobs ORDER BY created_at DESC LIMIT %s",
        (limit,),
    )
    return {
        "items": [
            {
                "job_id": str(job_id),
                "business_id": str(business_id),
                "upload_type": upload_type,
                "status": status,
                "error_message": message,
                "total_rows": total_rows,
                "loaded_rows": loaded_rows,
                "rejected_rows": rejected_rows,
                "skipped_rows": skipped_rows,
                "created_at": created_at.isoformat(),
            }
            for (job_id, business_id, upload_type, status, message, total_rows, loaded_rows,
                 rejected_rows, skipped_rows, created_at) in cur.fetchall()
        ]
    }
