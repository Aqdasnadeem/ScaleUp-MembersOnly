"""Business-scoped analytics endpoints for uploaded records."""
import datetime as dt
from typing import Literal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import current_business_id
from .routes_uploads import get_conn

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _expense_month_bounds(month: str) -> tuple[dt.date, dt.date, dt.date]:
    try:
        if len(month) != 7 or month[4] != "-":
            raise ValueError
        start = dt.date.fromisoformat(month + "-01")
        previous = (start - dt.timedelta(days=1)).replace(day=1)
        next_month = (start.replace(day=28) + dt.timedelta(days=4)).replace(day=1)
    except (ValueError, OverflowError):
        raise HTTPException(422, "month must be a valid YYYY-MM with a previous and next month")
    return previous, start, next_month


@router.get("/expenses")
def expense_categories(
    month: str = Query(..., description="Calendar month in YYYY-MM format."),
    business_id: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn),
):
    """Compare category totals in the selected month and preceding calendar month."""
    previous, start, next_month = _expense_month_bounds(month)
    cursor = conn.cursor()
    cursor.execute(
        """SELECT category,
                  COALESCE(SUM(amount) FILTER (WHERE expense_date >= %s), 0),
                  COALESCE(SUM(amount) FILTER (WHERE expense_date < %s), 0)
           FROM expenses
           WHERE business_id = %s AND expense_date >= %s AND expense_date < %s
           GROUP BY category
           ORDER BY category""",
        (start, start, business_id, previous, next_month),
    )
    categories = []
    for category, current, previous_total in cursor.fetchall():
        change = float((current - previous_total) / previous_total * 100) if previous_total else None
        categories.append({
            "category": category,
            "total": float(current),
            "previous_total": float(previous_total),
            "change_percent": change,
        })
    return {"month": month, "previous_month": previous.isoformat()[:7], "categories": categories}


@router.get("/expenses/entries")
def expense_entries(
    month: str = Query(..., description="Calendar month in YYYY-MM format."),
    category: str = Query(..., min_length=1, max_length=100),
    business_id: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn),
):
    """Return recorded expenses in one category for the selected calendar month."""
    _, start, next_month = _expense_month_bounds(month)
    cursor = conn.cursor()
    cursor.execute(
        """SELECT expense_id, expense_date, amount, description
           FROM expenses
           WHERE business_id = %s AND category = %s
             AND expense_date >= %s AND expense_date < %s
           ORDER BY expense_date DESC, expense_id DESC""",
        (business_id, category, start, next_month),
    )
    return {
        "month": month,
        "category": category,
        "entries": [
            {"expense_id": expense_id, "date": date.isoformat(), "amount": float(amount), "description": description}
            for expense_id, date, amount, description in cursor.fetchall()
        ],
    }


@router.get("/sales")
def sales_analytics(
    start_date: dt.date = Query(..., description="Inclusive start date (YYYY-MM-DD)."),
    end_date: dt.date = Query(..., description="Inclusive end date (YYYY-MM-DD)."),
    interval: Literal["daily", "monthly"] = Query("daily"),
    business_id: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn),
):
    """Return gross revenue, distinct orders, AOV and a daily or monthly trend."""
    if start_date > end_date:
        raise HTTPException(422, "start_date must be on or before end_date")

    cursor = conn.cursor()
    cursor.execute(
        """SELECT COALESCE(SUM(total_amount), 0), COUNT(DISTINCT order_id)
           FROM sales
           WHERE business_id = %s AND sale_date >= %s AND sale_date <= %s""",
        (business_id, start_date, end_date),
    )
    gross_revenue, orders = cursor.fetchone()
    gross_revenue = float(gross_revenue)
    orders = int(orders)

    grain = "day" if interval == "daily" else "month"
    cursor.execute(
        """SELECT date_trunc(%s, sale_date::timestamp)::date AS period,
                  SUM(total_amount), COUNT(DISTINCT order_id)
           FROM sales
           WHERE business_id = %s AND sale_date >= %s AND sale_date <= %s
           GROUP BY period
           ORDER BY period""",
        (grain, business_id, start_date, end_date),
    )
    trend = [
        {
            "period": period.isoformat(),
            "gross_revenue": float(revenue),
            "orders": int(order_count),
        }
        for period, revenue, order_count in cursor.fetchall()
    ]

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "interval": interval,
        "metrics": {
            "gross_revenue": gross_revenue,
            "orders": orders,
            "average_order_value": gross_revenue / orders if orders else 0,
        },
        "trend": trend,
    }


@router.get("/products")
def product_analytics(
    start_date: dt.date = Query(..., description="Inclusive start date (YYYY-MM-DD)."),
    end_date: dt.date = Query(..., description="Inclusive end date (YYYY-MM-DD)."),
    business_id: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn),
):
    """Compare product revenue and margin with the immediately preceding equal-length period."""
    if start_date > end_date:
        raise HTTPException(422, "start_date must be on or before end_date")
    try:
        previous_end = start_date - dt.timedelta(days=1)
        previous_start = start_date - (end_date - start_date + dt.timedelta(days=1))
    except OverflowError:
        raise HTTPException(422, "date range is too early to calculate a previous period")

    cursor = conn.cursor()
    cursor.execute(
        """SELECT p.product_id, p.product_key, p.product_name, p.cost_price,
                  COALESCE(SUM(s.total_amount) FILTER (WHERE s.sale_date >= %s), 0),
                  COALESCE(SUM(s.quantity) FILTER (WHERE s.sale_date >= %s), 0),
                  COALESCE(SUM(s.total_amount) FILTER (WHERE s.sale_date < %s), 0)
           FROM sales s
           JOIN products p ON p.product_id = s.product_id AND p.business_id = s.business_id
           WHERE s.business_id = %s AND s.sale_date >= %s AND s.sale_date <= %s
           GROUP BY p.product_id, p.product_key, p.product_name, p.cost_price
           ORDER BY p.product_key, p.product_id""",
        (start_date, start_date, start_date, business_id, previous_start, end_date),
    )
    products = []
    for product_id, key, name, cost, revenue, quantity, previous_revenue in cursor.fetchall():
        margin = None
        if cost is not None and revenue > 0:
            margin = float((revenue - cost * quantity) / revenue * 100)
        products.append({
            "product_id": product_id,
            "product_key": key,
            "product_name": name or key,
            "gross_revenue": float(revenue),
            "previous_gross_revenue": float(previous_revenue),
            "margin_percent": margin,
        })

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "previous_start_date": previous_start.isoformat(),
        "previous_end_date": previous_end.isoformat(),
        "products": products,
    }
