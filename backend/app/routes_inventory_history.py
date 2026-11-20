"""P2-26-BE: Business-scoped inventory change history API (stock movement over time per product)."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Path

from .auth import current_business_id
from .routes_uploads import get_conn

router = APIRouter(prefix="/analytics/inventory", tags=["inventory analytics"])


@router.get("/products/{product_id}/history")
def inventory_history(
    product_id: int = Path(..., ge=1, le=9223372036854775807),
    business_id: uuid.UUID = Depends(current_business_id),
    conn=Depends(get_conn),
):
    """Return persisted inventory snapshots in date order for one business-owned product.

    Returns exactly the imported snapshot rows (date, stock_quantity); nothing is interpolated
    or inferred between recorded dates."""
    cursor = conn.cursor()
    cursor.execute(
        "SELECT 1 FROM products WHERE business_id = %s AND product_id = %s",
        (business_id, product_id),
    )
    if cursor.fetchone() is None:
        raise HTTPException(404, "product not found")
    cursor.execute(
        """SELECT snapshot_date, stock_quantity FROM inventory
           WHERE business_id = %s AND product_id = %s
           ORDER BY snapshot_date, inventory_id""",
        (business_id, product_id),
    )
    return {
        "product_id": product_id,
        "snapshots": [
            {"snapshot_date": date.isoformat(), "stock_quantity": quantity}
            for date, quantity in cursor.fetchall()
        ],
    }
