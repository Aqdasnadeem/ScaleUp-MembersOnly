"""P2-25-BE: Business-scoped low stock and stockout alerts API."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Path

from .auth import current_business_id
from .routes_uploads import get_conn

router = APIRouter(prefix="/analytics/inventory", tags=["inventory analytics"])


def _stock_status(quantity: int, threshold: int) -> str:
    if quantity == 0:
        return "stockout"
    return "low_stock" if quantity < threshold else "in_stock"


def _inventory_product(row, threshold: int) -> dict:
    product_id, key, name, category, quantity, snapshot_date = row
    return {
        "product_id": product_id,
        "product_key": key,
        "product_name": name or key,
        "category": category,
        "stock_quantity": quantity,
        "snapshot_date": snapshot_date.isoformat(),
        "threshold": threshold,
        "status": _stock_status(quantity, threshold),
    }


def _business_stock_threshold(cursor, business_id: uuid.UUID) -> int:
    """The business's configured threshold (businesses.low_stock_threshold); update that column to change it."""
    cursor.execute("SELECT low_stock_threshold FROM businesses WHERE business_id = %s", (business_id,))
    row = cursor.fetchone()
    if row is None:
        raise HTTPException(404, "business not found")
    return row[0]


_LATEST_INVENTORY = """SELECT DISTINCT ON (p.product_id) p.product_id, p.product_key, p.product_name,
                              p.category, i.stock_quantity, i.snapshot_date
                       FROM inventory i
                       JOIN products p ON p.product_id = i.product_id AND p.business_id = i.business_id
                       WHERE i.business_id = %s
                       ORDER BY p.product_id, i.snapshot_date DESC, i.inventory_id DESC"""


@router.get("/alerts")
def inventory_alerts(
    business_id: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn),
):
    """Return stockouts and products below the business threshold using their latest snapshots."""
    cursor = conn.cursor()
    threshold = _business_stock_threshold(cursor, business_id)
    cursor.execute("SELECT EXISTS(SELECT 1 FROM inventory WHERE business_id = %s)", (business_id,))
    has_inventory = cursor.fetchone()[0]
    cursor.execute(
        """SELECT latest.product_id, latest.product_key, latest.product_name,
                  latest.category, latest.stock_quantity, latest.snapshot_date
           FROM (""" + _LATEST_INVENTORY + """) latest
           WHERE latest.stock_quantity = 0 OR latest.stock_quantity < %s
           ORDER BY latest.stock_quantity, latest.product_key, latest.product_id""",
        (business_id, threshold),
    )
    return {
        "threshold": threshold,
        "has_inventory": has_inventory,
        "alerts": [_inventory_product(row, threshold) for row in cursor.fetchall()],
    }


@router.get("/products")
def inventory_products(
    business_id: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn),
):
    """Return all business-owned products that have an inventory snapshot, with their latest status."""
    cursor = conn.cursor()
    threshold = _business_stock_threshold(cursor, business_id)
    cursor.execute(
        "SELECT * FROM (" + _LATEST_INVENTORY + ") latest ORDER BY product_key, product_id",
        (business_id,),
    )
    return {"products": [_inventory_product(row, threshold) for row in cursor.fetchall()]}


@router.get("/products/{product_id}")
def inventory_product(
    product_id: int = Path(..., ge=1, le=9223372036854775807),
    business_id: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn),
):
    """Return one business-owned product's latest inventory snapshot and alert status."""
    cursor = conn.cursor()
    threshold = _business_stock_threshold(cursor, business_id)
    cursor.execute(
        """SELECT p.product_id, p.product_key, p.product_name, p.category,
                  i.stock_quantity, i.snapshot_date
           FROM products p
           JOIN inventory i ON i.product_id = p.product_id AND i.business_id = p.business_id
           WHERE p.business_id = %s AND p.product_id = %s
           ORDER BY i.snapshot_date DESC, i.inventory_id DESC
           LIMIT 1""",
        (business_id, product_id),
    )
    row = cursor.fetchone()
    if row is None:
        raise HTTPException(404, "product inventory not found")
    return _inventory_product(row, threshold)
