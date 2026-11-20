# P2-25-BE: Low Stock and Stockout API

## Ticket and Branch
- Ticket: P2-25-BE (#21)
- Branch: p2-25-be-low-stock-api

## Files Added
- backend/app/routes_inventory_alerts.py
- backend/tests/test_low_stock_api.py
- backend/docs/checks/P2-25_manual_check.sql

## Endpoints
GET /analytics/inventory/alerts
GET /analytics/inventory/products
GET /analytics/inventory/products/{product_id}

All three require a bearer token and are scoped to the authenticated business.

- `/alerts` lists only the products at or below the business's threshold (status `stockout` or `low_stock`), using each product's **latest** inventory snapshot.
- `/products` lists every business-owned product that has at least one snapshot, with the same status computed, so the frontend can show both the alert list and the full stock table from one source of truth.
- `/products/{id}` returns the same shape for a single product (used by the product detail screen).

Status rules: zero stock is always `stockout` regardless of threshold; stock strictly below the threshold is `low_stock`; otherwise `in_stock`. A product with no inventory snapshot at all is left out (not assumed to be a stockout).

## Threshold configurable (acceptance criterion)
The threshold is `businesses.low_stock_threshold` (migration 001, default 10, `CHECK (low_stock_threshold >= 0)`), one value per business, read fresh on every request. Changing it (e.g. `UPDATE businesses SET low_stock_threshold = 5 WHERE business_id = ...`) immediately changes who shows up in `/alerts` and everyone's `status` in `/products` — no redeploy needed. Exposing a settings endpoint to edit it from the UI is not part of this ticket's scope (FYP-1 only asks that the limit be configurable, not that there be a screen for it yet).

## Shared File Integration
Do not directly modify shared backend/app/main.py in this ticket package.

Add this import:
    from .routes_inventory_alerts import router as inventory_alerts_router

Add this router registration:
    app.include_router(inventory_alerts_router)

## Authentication and Tenant Isolation
- Business ID comes only from the authenticated JWT (`current_business_id`).
- All inventory and product queries are scoped by business_id; no cross-business row can be returned.
- SQL values use parameterized queries.
- Missing authentication returns 401.
- A product_id that belongs to another business, or does not exist, returns 404 (never leaks whether it belongs to someone else).

## Tests

Command:
    python -m pytest backend/tests/test_low_stock_api.py -v

Final result (this machine, PostgreSQL 18, Windows): 3 passed.

Tests cover: latest-snapshot-wins when a product has multiple dated snapshots, stockout vs low_stock vs in_stock boundaries, the threshold being configurable per business (same data, different alert list after the business's threshold changes), single-product detail matching its row in the alert list, 401 with no token, empty/isolated results for a business with no data, and 404/422 for a product id that is missing, foreign, or out of range.

## Manual SQL
File: backend/docs/checks/P2-25_manual_check.sql

Replace YOUR-BUSINESS-UUID with a real business UUID before running. Manual SQL execution has not yet been recorded.

## Gaps / Notes
- `/products` and the single-product endpoint are shared with P2-26-BE's history screen (the frontend's product list links into product history); they are included here because the alert list and the full product table are computed from the same "latest snapshot" query.
- Several warehouses per product (inventory key is product + date only, no location) is out of scope for FYP-1, consistent with the SRS's one-location-per-business assumption.
