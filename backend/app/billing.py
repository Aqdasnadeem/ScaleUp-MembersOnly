"""Plans (free/pro) and a mock checkout. No real money moves (FYP-1 demo).

PaymentProvider is the seam for a real gateway later (e.g. a Safepay sandbox): only MockProvider
is implemented. Business-scoped; business_id always comes from the JWT (current_business_id), never
from the request body."""
import datetime as dt
import uuid
from abc import ABC, abstractmethod
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException

from . import config
from .auth import current_business_id
from .db import pool_connect, pool_release

router = APIRouter(prefix="/billing", tags=["billing"])

PLAN_PRICE_PKR = {"pro": Decimal("2500.00")}        # demo price; no real currency conversion or tax
PLAN_PERIOD_DAYS = 30


def _conn():
    """Local connection dependency (mirrors app/auth.py's _conn): avoids importing routes_uploads.py,
    which would import this module back for enforce_upload_limit and create a circular import."""
    conn = pool_connect()
    try:
        yield conn
    finally:
        pool_release(conn)


def effective_plan(plan: str, plan_expires_at: dt.datetime | None) -> str:
    """'pro' only while plan='pro' and not expired; otherwise 'free'. Computed at request time,
    no cron job, so an expired pro plan acts as free the moment it expires, no later."""
    if plan == "pro" and (plan_expires_at is None or plan_expires_at > dt.datetime.now(dt.timezone.utc)):
        return "pro"
    return "free"


def _business_plan(cursor, business_id: uuid.UUID):
    cursor.execute("SELECT plan, plan_expires_at FROM businesses WHERE business_id = %s", (business_id,))
    row = cursor.fetchone()
    if row is None:
        raise HTTPException(404, "business not found")
    return row                                     # (plan, plan_expires_at)


def count_uploads_this_month(cursor, business_id: uuid.UUID) -> int:
    """Uploads counted toward the monthly quota: this calendar month, any status except 'failed'
    (a bad CSV that failed validation must not eat the quota)."""
    cursor.execute(
        "SELECT COUNT(*) FROM ingestion_jobs WHERE business_id = %s AND status != 'failed' "
        "AND created_at >= date_trunc('month', now())",
        (business_id,),
    )
    return cursor.fetchone()[0]


def enforce_upload_limit(business_id: uuid.UUID = Depends(current_business_id), conn=Depends(_conn)) -> None:
    """Dependency for POST /uploads. A super admin never reaches here: current_business_id already
    rejects a super_admin token with 403 before this dependency would run."""
    cursor = conn.cursor()
    plan, plan_expires_at = _business_plan(cursor, business_id)
    plan = effective_plan(plan, plan_expires_at)
    limit = config.PLAN_LIMITS[plan]["uploads_per_month"]
    used = count_uploads_this_month(cursor, business_id)
    if used >= limit:
        raise HTTPException(402, detail={"code": "PLAN_LIMIT", "plan": plan, "limit": limit, "used": used})


class PaymentProvider(ABC):
    @abstractmethod
    def charge(self, cursor, business_id: uuid.UUID, plan: str):
        """Create and settle a payment row for the given plan. Returns the inserted row."""
        raise NotImplementedError


class MockProvider(PaymentProvider):
    """Always succeeds: inserts a payments row already marked paid. Stands in for a real sandbox
    gateway without changing the routes below when one is added."""

    def charge(self, cursor, business_id: uuid.UUID, plan: str):
        amount = PLAN_PRICE_PKR[plan]
        cursor.execute(
            "INSERT INTO payments(business_id, plan, amount, currency, provider, provider_ref, status) "
            "VALUES (%s, %s, %s, 'PKR', 'mock', %s, 'paid') "
            "RETURNING id, business_id, plan, amount, currency, provider, provider_ref, status, created_at",
            (business_id, plan, amount, "mock-" + uuid.uuid4().hex[:12]),
        )
        return cursor.fetchone()


PROVIDER: PaymentProvider = MockProvider()


@router.get("/me")
def billing_me(business_id: uuid.UUID = Depends(current_business_id), conn=Depends(_conn)):
    cursor = conn.cursor()
    stored_plan, plan_expires_at = _business_plan(cursor, business_id)
    plan = effective_plan(stored_plan, plan_expires_at)
    used = count_uploads_this_month(cursor, business_id)
    return {
        "plan": plan,
        "plan_expires_at": plan_expires_at.isoformat() if plan_expires_at else None,
        "limits": config.PLAN_LIMITS[plan],
        "usage": {"uploads_this_month": used},
    }


@router.post("/checkout")
def checkout(business_id: uuid.UUID = Depends(current_business_id), conn=Depends(_conn)):
    """Mock payment only: always succeeds, sets plan='pro' for 30 days. If already pro and not
    expired, the 30 days extend from the current expiry rather than restarting from now."""
    cursor = conn.cursor()
    stored_plan, plan_expires_at = _business_plan(cursor, business_id)
    now = dt.datetime.now(dt.timezone.utc)
    still_pro = stored_plan == "pro" and plan_expires_at is not None and plan_expires_at > now
    base = plan_expires_at if still_pro else now
    new_expiry = base + dt.timedelta(days=PLAN_PERIOD_DAYS)

    payment = PROVIDER.charge(cursor, business_id, "pro")
    cursor.execute(
        "UPDATE businesses SET plan = 'pro', plan_expires_at = %s WHERE business_id = %s "
        "RETURNING plan, plan_expires_at",
        (new_expiry, business_id),
    )
    plan, expires_at = cursor.fetchone()
    conn.commit()
    return {
        "payment_id": payment[0],
        "plan": plan,
        "plan_expires_at": expires_at.isoformat(),
    }
