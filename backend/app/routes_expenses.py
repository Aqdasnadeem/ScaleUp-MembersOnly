"""P2-27 expense analytics and P2-28 dashboard flags."""
import datetime as dt
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import current_business_id
from .expense_flags import category_entries, category_summary
from .routes_uploads import get_conn

router = APIRouter(prefix="/expenses", tags=["expenses"])
_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _parse_month(value: str) -> dt.date:
    if not _MONTH.fullmatch(value):
        raise HTTPException(422, "month must use YYYY-MM format")
    try:
        return dt.date.fromisoformat(value + "-01")
    except ValueError:
        raise HTTPException(422, "month must be a valid calendar month")


@router.get("/categories")
def expenses_by_category(
    month: str = Query(..., description="Calendar month in YYYY-MM format"),
    biz: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn),
):
    """Totals, month-over-month change, and unusual-increase status by category."""
    return category_summary(conn, biz, _parse_month(month))


@router.get("/categories/{category}/entries")
def expense_category_entries(
    category: str,
    month: str = Query(..., description="Calendar month in YYYY-MM format"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    biz: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn),
):
    """Return paginated expense entries for a category and month."""
    normalized_category = category.strip().lower()
    if not normalized_category:
        raise HTTPException(422, "category must not be empty")
    parsed_month = _parse_month(month)
    items = category_entries(
        conn,
        biz,
        parsed_month,
        normalized_category,
        limit,
        offset,
    )
    return {
        "month": parsed_month.isoformat()[:7],
        "category": normalized_category,
        "items": items,
        "limit": limit,
        "offset": offset,
    }
