-- P2-25-BE: Low Stock and Stockout API manual verification
-- Replace the value below with a real business UUID before execution.

\set business_id 'YOUR-BUSINESS-UUID'

-- 1. The business's configured threshold (the "configurable" part of the acceptance criterion).
SELECT business_id, business_name, low_stock_threshold
FROM businesses
WHERE business_id = :'business_id'::uuid;

-- 2. Latest snapshot per product for this business (what /alerts and /products both read).
WITH latest AS (
    SELECT DISTINCT ON (p.product_id)
        p.product_id, p.product_key, p.product_name, p.category,
        i.stock_quantity, i.snapshot_date
    FROM inventory i
    JOIN products p ON p.product_id = i.product_id AND p.business_id = i.business_id
    WHERE i.business_id = :'business_id'::uuid
    ORDER BY p.product_id, i.snapshot_date DESC, i.inventory_id DESC
)
SELECT *,
    CASE
        WHEN stock_quantity = 0 THEN 'stockout'
        WHEN stock_quantity < (SELECT low_stock_threshold FROM businesses WHERE business_id = :'business_id'::uuid)
            THEN 'low_stock'
        ELSE 'in_stock'
    END AS status
FROM latest
ORDER BY stock_quantity, product_key;

-- 3. Only the rows GET /analytics/inventory/alerts would return.
WITH latest AS (
    SELECT DISTINCT ON (p.product_id)
        p.product_id, p.product_key, i.stock_quantity, i.snapshot_date
    FROM inventory i
    JOIN products p ON p.product_id = i.product_id AND p.business_id = i.business_id
    WHERE i.business_id = :'business_id'::uuid
    ORDER BY p.product_id, i.snapshot_date DESC, i.inventory_id DESC
)
SELECT * FROM latest
WHERE stock_quantity = 0
   OR stock_quantity < (SELECT low_stock_threshold FROM businesses WHERE business_id = :'business_id'::uuid)
ORDER BY stock_quantity, product_key;
