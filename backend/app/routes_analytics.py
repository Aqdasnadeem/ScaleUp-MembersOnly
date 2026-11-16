"""Business-scoped analytics endpoints for uploaded records."""
import datetime as dt
from typing import Literal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import current_business_id
from .routes_uploads import get_conn

router = APIRouter(prefix="/analytics", tags=["analytics"])


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
