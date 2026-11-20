# P2-26-BE: Inventory Change History API

## Ticket and Branch
- Ticket: P2-26-BE (#22)
- Branch: p2-26-be-inventory-history-api

## Files Added
- backend/app/routes_inventory_history.py
- backend/tests/test_inventory_history_api.py
- backend/docs/checks/P2-26_manual_check.sql

## Endpoint
GET /analytics/inventory/products/{product_id}/history

Requires a bearer token. Scoped to the authenticated business.

Response:
    {
      "product_id": <int>,
      "snapshots": [
        {"snapshot_date": "YYYY-MM-DD", "stock_quantity": <int>},
        ...
      ]
    }

Snapshots are returned in ascending date order. A product that exists but has no inventory file imported yet returns an empty `snapshots` list, not a 404 — 404 is reserved for a product_id that does not exist or does not belong to the caller's business.

## Matches imported data (acceptance criterion)
This endpoint does not interpolate, infer, or smooth stock levels between recorded dates. It returns exactly the `inventory` rows (`snapshot_date`, `stock_quantity`) that a CSV import created for that product, in the order they were taken. If the same product+date pair is re-uploaded, the loader's own duplicate rule applies (no extra row); this endpoint always reflects what is currently persisted, nothing more.

## Shared File Integration
Do not directly modify shared backend/app/main.py in this ticket package.

Add this import:
    from .routes_inventory_history import router as inventory_history_router

Add this router registration:
    app.include_router(inventory_history_router)

## Authentication and Tenant Isolation
- Business ID comes only from the authenticated JWT (`current_business_id`).
- The product-ownership check (`WHERE business_id = %s AND product_id = %s`) runs before any snapshot is read, so a product_id from another business returns 404, never another business's history.
- SQL values use parameterized queries.
- Missing authentication returns 401.

## Tests

Command:
    python -m pytest backend/tests/test_inventory_history_api.py -v

Final result (this machine, PostgreSQL 18, Windows): 2 passed.

Tests cover: snapshots returned in date order exactly as imported (including when uploaded out of order), business isolation (another business's token gets 404 for the same product_id), missing token (401), a product id that does not exist or is out of range (404 / 422), and a product that has no snapshot yet (empty list, 200).

## Manual SQL
File: backend/docs/checks/P2-26_manual_check.sql

Replace YOUR-BUSINESS-UUID and YOUR-PRODUCT-ID with real values before running. Manual SQL execution has not yet been recorded.

## Gaps / Notes
- Depends on P2-14 (bulk load) for the `inventory` table to contain any rows; this ticket only reads what the loader already wrote.
- No location dimension (one location per business, FYP-1 SRS assumption), so history is per product only, not per product-per-warehouse.
