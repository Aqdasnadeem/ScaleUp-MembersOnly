"""P2-23-BE: Business-scoped sales KPIs and revenue trends."""

import datetime as dt
import uuid

from decimal import Decimal
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import current_business_id
from .routes_uploads import get_conn


router = APIRouter(prefix="/analytics/sales", tags=["sales analytics"])

MONEY_DECIMAL_PLACES = 2  # All monetary responses use two decimal places.


def _money(value):
    """Convert database numeric values to JSON-friendly two-decimal numbers."""
    if value is None:
        return None
    return float(Decimal(str(value)).quantize(Decimal("0.01")))


def _resolve_range(conn, business_id, date_from, date_to):
    """Use the business's first and last sale dates when filters are omitted."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT MIN(sale_date), MAX(sale_date)
        FROM sales
        WHERE business_id = %s
        """,
        (business_id,),
    )
    first_date, last_date = cur.fetchone()

    resolved_from = date_from or first_date
    resolved_to = date_to or last_date

    if resolved_from and not resolved_to:
        resolved_to = resolved_from

    if resolved_to and not resolved_from:
        resolved_from = resolved_to

    return resolved_from, resolved_to


def _validate_range(date_from, date_to):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=422,
            detail="'from' date must be on or before 'to' date",
        )


@router.get("/kpis")
def sales_kpis(
    date_from: Optional[dt.date] = Query(None, alias="from"),
    date_to: Optional[dt.date] = Query(None, alias="to"),
    biz: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn),
):
    _validate_range(date_from, date_to)
    date_from, date_to = _resolve_range(conn, biz, date_from, date_to)

    if date_from is None or date_to is None:
        return {
            "range": {"from": None, "to": None},
            "gross_revenue": 0.00,
            "orders": 0,
            "units_sold": 0,
            "avg_order_value": None,
        }

    cur = conn.cursor()
    cur.execute(
        """
        SELECT
            COALESCE(SUM(total_amount), 0),
            COUNT(DISTINCT order_id),
            COALESCE(SUM(quantity), 0)
        FROM sales
        WHERE business_id = %s
          AND sale_date >= %s
          AND sale_date <= %s
        """,
        (biz, date_from, date_to),
    )
    revenue, orders, units = cur.fetchone()

    average = revenue / orders if orders else None

    return {
        "range": {
            "from": date_from.isoformat(),
            "to": date_to.isoformat(),
        },
        "gross_revenue": _money(revenue),
        "orders": orders,
        "units_sold": units,
        "avg_order_value": _money(average),
    }


@router.get("/trend")
def revenue_trend(
    date_from: Optional[dt.date] = Query(None, alias="from"),
    date_to: Optional[dt.date] = Query(None, alias="to"),
    granularity: Literal["day", "month"] = Query("day"),
    biz: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn),
):
    _validate_range(date_from, date_to)
    date_from, date_to = _resolve_range(conn, biz, date_from, date_to)

    if date_from is None or date_to is None:
        return {
            "range": {"from": None, "to": None},
            "granularity": granularity,
            "data": [],
        }

    cur = conn.cursor()

    if granularity == "day":
        cur.execute(
            """
            WITH periods AS (
                SELECT generate_series(
                    %s::date,
                    %s::date,
                    interval '1 day'
                )::date AS period
            ),
            totals AS (
                SELECT sale_date AS period, SUM(total_amount) AS revenue
                FROM sales
                WHERE business_id = %s
                  AND sale_date >= %s
                  AND sale_date <= %s
                GROUP BY sale_date
            )
            SELECT periods.period, COALESCE(totals.revenue, 0)
            FROM periods
            LEFT JOIN totals ON totals.period = periods.period
            ORDER BY periods.period
            """,
            (date_from, date_to, biz, date_from, date_to),
        )
    else:
        cur.execute(
            """
            WITH periods AS (
                SELECT generate_series(
                    date_trunc('month', %s::date),
                    date_trunc('month', %s::date),
                    interval '1 month'
                )::date AS period
            ),
            totals AS (
                SELECT
                    date_trunc('month', sale_date)::date AS period,
                    SUM(total_amount) AS revenue
                FROM sales
                WHERE business_id = %s
                  AND sale_date >= %s
                  AND sale_date <= %s
                GROUP BY date_trunc('month', sale_date)
            )
            SELECT periods.period, COALESCE(totals.revenue, 0)
            FROM periods
            LEFT JOIN totals ON totals.period = periods.period
            ORDER BY periods.period
            """,
            (date_from, date_to, biz, date_from, date_to),
        )

    rows = cur.fetchall()

    return {
        "range": {
            "from": date_from.isoformat(),
            "to": date_to.isoformat(),
        },
        "granularity": granularity,
        "data": [
            {"period": period.isoformat(), "revenue": _money(revenue)}
            for period, revenue in rows
        ],
    }
