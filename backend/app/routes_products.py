"""P2-24-BE: Business-scoped product performance ranking API."""

import datetime as dt
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query

from .auth import current_business_id
from .routes_uploads import get_conn


router = APIRouter(
    prefix="/analytics/products",
    tags=["product analytics"]
)


def money(value):
    if value is None:
        return None
    return float(Decimal(str(value)).quantize(Decimal("0.01")))


def resolve_range(conn, business_id, date_from, date_to):
    cur = conn.cursor()

    cur.execute(
        """
        SELECT MIN(s.sale_date), MAX(s.sale_date)
        FROM sales s
        WHERE s.business_id = %s
        """,
        (business_id,)
    )

    first_date, last_date = cur.fetchone()

    if first_date is None:
        return None, None

    resolved_from = date_from or first_date
    resolved_to = date_to or last_date

    return resolved_from, resolved_to


@router.get("/ranking")
def product_ranking(
    date_from: dt.date = Query(default=None, alias="from"),
    date_to: dt.date = Query(default=None, alias="to"),
    sort: str = Query(default="revenue"),
    limit: int = Query(default=10, ge=1, le=50),
    biz: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn)
):
    if sort not in ("revenue", "margin"):
        raise HTTPException(
            status_code=422,
            detail="sort must be revenue or margin"
        )

    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=422,
            detail="from date must not be after to date"
        )

    resolved_from, resolved_to = resolve_range(
        conn, biz, date_from, date_to
    )

    if resolved_from is None:
        return {
            "from": None,
            "to": None,
            "previous_range": None,
            "sort": sort,
            "limit": limit,
            "products_without_cost": 0,
            "data": []
        }

    if resolved_from > resolved_to:
        raise HTTPException(
            status_code=422,
            detail="from date must not be after to date"
        )

    period_days = (resolved_to - resolved_from).days + 1
    previous_to = resolved_from - dt.timedelta(days=1)
    previous_from = previous_to - dt.timedelta(days=period_days - 1)

    cur = conn.cursor()

    cur.execute(
        """
        WITH current_sales AS (
            SELECT
                product_id,
                SUM(total_amount) AS revenue,
                SUM(quantity) AS units
            FROM sales
            WHERE business_id = %s
              AND sale_date >= %s
              AND sale_date <= %s
            GROUP BY product_id
        ),
        previous_sales AS (
            SELECT
                product_id,
                SUM(total_amount) AS revenue,
                SUM(quantity) AS units
            FROM sales
            WHERE business_id = %s
              AND sale_date >= %s
              AND sale_date <= %s
            GROUP BY product_id
        )
        SELECT
            p.product_id,
            p.product_key,
            p.product_name,
            p.category,
            p.cost_price,
            COALESCE(cs.revenue, 0) AS revenue,
            COALESCE(cs.units, 0) AS units,
            COALESCE(ps.revenue, 0) AS previous_revenue,
            COALESCE(ps.units, 0) AS previous_units
        FROM products p
        LEFT JOIN current_sales cs
            ON cs.product_id = p.product_id
        LEFT JOIN previous_sales ps
            ON ps.product_id = p.product_id
        WHERE p.business_id = %s
          AND cs.product_id IS NOT NULL
        """,
        (
            biz,
            resolved_from,
            resolved_to,
            biz,
            previous_from,
            previous_to,
            biz
        )
    )

    rows = cur.fetchall()

    products = []
    products_without_cost = 0

    for row in rows:
        (
            product_id,
            product_key,
            product_name,
            category,
            cost_price,
            revenue,
            units,
            previous_revenue,
            previous_units
        ) = row

        revenue = Decimal(str(revenue))
        previous_revenue = Decimal(str(previous_revenue))
        units = int(units)
        previous_units = int(previous_units)

        if cost_price is None:
            margin = None
            margin_pct = None
            products_without_cost += 1
        else:
            margin = revenue - (
                Decimal(units) * Decimal(str(cost_price))
            )

            margin_pct = (
                float(margin / revenue * 100)
                if revenue != 0
                else None
            )

        revenue_change_pct = (
            float(
                (revenue - previous_revenue)
                / previous_revenue * 100
            )
            if previous_revenue != 0
            else None
        )

        products.append({
            "product_id": product_id,
            "product_key": product_key,
            "product_name": product_name,
            "category": category,
            "revenue": money(revenue),
            "units": units,
            "margin": money(margin),
            "margin_pct": (
                round(margin_pct, 2)
                if margin_pct is not None
                else None
            ),
            "previous_revenue": money(previous_revenue),
            "previous_units": previous_units,
            "revenue_change_pct": (
                round(revenue_change_pct, 2)
                if revenue_change_pct is not None
                else None
            )
        })

    if sort == "margin":
        products = [
            item for item in products
            if item["margin"] is not None
        ]
        products.sort(
            key=lambda item: item["margin"],
            reverse=True
        )
    else:
        products.sort(
            key=lambda item: item["revenue"],
            reverse=True
        )

    return {
        "from": resolved_from.isoformat(),
        "to": resolved_to.isoformat(),
        "previous_range": {
            "from": previous_from.isoformat(),
            "to": previous_to.isoformat()
        },
        "sort": sort,
        "limit": limit,
        "products_without_cost": products_without_cost,
        "data": products[:limit]
    }
