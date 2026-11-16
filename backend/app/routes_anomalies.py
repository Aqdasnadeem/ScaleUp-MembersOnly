"""Local, on-demand anomaly comparisons over business-owned uploaded records."""
import datetime as dt
from decimal import Decimal
from typing import Literal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from . import config
from .auth import current_business_id
from .routes_uploads import get_conn

router = APIRouter(prefix="/analytics", tags=["analytics"])
THRESHOLD_PERCENT = Decimal("50")
MIN_SALES_DAYS = 3


def _anomaly(kind, key, date, metric, value, baseline, unit, evidence, explanation):
    if baseline <= 0:
        return None
    change = (Decimal(value) - Decimal(baseline)) / Decimal(baseline) * 100
    if abs(change) < THRESHOLD_PERCENT:
        return None
    return {
        "id": f"{kind}:{key}:{date.isoformat()}",
        "type": kind,
        "date": date.isoformat(),
        "metric": metric,
        "value": float(value),
        "baseline": float(baseline),
        "change_percent": float(change),
        "unit": unit,
        "explanation": explanation,
        "evidence": [{"date": day.isoformat(), "value": float(amount)} for day, amount in evidence],
    }


def _sales_anomalies(cursor, business_id, start, end):
    cursor.execute(
        """SELECT sale_date, SUM(total_amount) FROM sales
           WHERE business_id = %s AND sale_date >= %s AND sale_date <= %s
           GROUP BY sale_date ORDER BY sale_date""",
        (business_id, start - dt.timedelta(days=7), end),
    )
    daily = dict(cursor.fetchall())
    anomalies = []
    for day, total in daily.items():
        if day < start:
            continue
        prior = [(day - dt.timedelta(days=offset), daily[day - dt.timedelta(days=offset)])
                 for offset in range(7, 0, -1) if day - dt.timedelta(days=offset) in daily]
        if len(prior) < MIN_SALES_DAYS:
            continue
        baseline = sum((amount for _, amount in prior), Decimal(0)) / len(prior)
        item = _anomaly("sales", "revenue", day, "Daily sales revenue", total, baseline, "currency",
                        prior + [(day, total)], "Compared with the average of recorded sales days in the previous 7 calendar days.")
        if item:
            anomalies.append(item)
    return anomalies


def _expense_anomalies(cursor, business_id, start, end):
    previous_start = (start.replace(day=1) - dt.timedelta(days=1)).replace(day=1)
    cursor.execute(
        """SELECT category, date_trunc('month', expense_date::timestamp)::date,
                  SUM(amount), MAX(expense_date)
           FROM expenses
           WHERE business_id = %s AND expense_date >= %s AND expense_date <= %s
           GROUP BY category, date_trunc('month', expense_date::timestamp)::date
           ORDER BY category, 2""",
        (business_id, previous_start, end),
    )
    previous = {}
    anomalies = []
    for category, month, total, last_date in cursor.fetchall():
        previous_month = (month - dt.timedelta(days=1)).replace(day=1)
        earlier = previous.get((category, previous_month))
        if earlier is not None and last_date >= start:
            item = _anomaly(
                "expenses", category, last_date, f"Monthly expenses: {category}", total, earlier, "currency",
                [(previous_month, earlier), (month, total)],
                "Compared with the previous calendar month's recorded total for this category. The selected end month may be incomplete.",
            )
            if item:
                anomalies.append(item)
        previous[(category, month)] = total
    return anomalies


def _inventory_anomalies(cursor, business_id, start, end):
    cursor.execute(
        """SELECT product_id, product_key, product_name, snapshot_date, stock_quantity,
                  previous_date, previous_quantity
           FROM (
               SELECT p.product_id, p.product_key, p.product_name, i.snapshot_date, i.stock_quantity,
                      LAG(i.snapshot_date) OVER product_history AS previous_date,
                      LAG(i.stock_quantity) OVER product_history AS previous_quantity
               FROM inventory i
               JOIN products p ON p.product_id = i.product_id AND p.business_id = i.business_id
               WHERE i.business_id = %s AND i.snapshot_date <= %s
               WINDOW product_history AS (PARTITION BY i.product_id ORDER BY i.snapshot_date, i.inventory_id)
           ) snapshots
           WHERE snapshot_date >= %s
           ORDER BY snapshot_date, product_id""",
        (business_id, end, start),
    )
    anomalies = []
    for product_id, key, name, day, quantity, previous_day, previous_quantity in cursor.fetchall():
        if previous_quantity is None:
            continue
        item = _anomaly(
            "inventory", str(product_id), day, f"Stock: {name or key}", quantity, previous_quantity, "units",
            [(previous_day, previous_quantity), (day, quantity)],
            "Compared with the previous recorded snapshot for this product.",
        )
        if item:
            anomalies.append(item)
    return anomalies


@router.get("/anomalies")
def list_anomalies(
    start_date: dt.date = Query(..., description="Inclusive start date."),
    end_date: dt.date = Query(..., description="Inclusive end date."),
    type: Literal["sales", "expenses", "inventory"] | None = Query(None),
    business_id: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn),
):
    """Compare persisted records on demand; this is not the P2-29 scheduled job."""
    if start_date < config.DATE_MIN or start_date > end_date or end_date > config.today_local():
        raise HTTPException(422, "dates must be ordered, no earlier than 2000-01-01, and not in the future")
    cursor = conn.cursor()
    anomalies = []
    for kind, calculate in (
        ("sales", _sales_anomalies),
        ("expenses", _expense_anomalies),
        ("inventory", _inventory_anomalies),
    ):
        if type is None or type == kind:
            anomalies.extend(calculate(cursor, business_id, start_date, end_date))
    anomalies.sort(key=lambda item: (item["date"], item["id"]), reverse=True)
    return {"start_date": start_date.isoformat(), "end_date": end_date.isoformat(), "anomalies": anomalies}
