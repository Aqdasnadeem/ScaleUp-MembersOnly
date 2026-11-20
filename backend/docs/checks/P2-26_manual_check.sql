-- P2-26-BE: Inventory Change History API manual verification
-- Replace the values below with a real business UUID and product id before execution.

\set business_id 'YOUR-BUSINESS-UUID'
\set product_id 'YOUR-PRODUCT-ID'

-- 1. Confirm the product belongs to this business (what the endpoint checks before anything else).
SELECT product_id, product_key, product_name
FROM products
WHERE business_id = :'business_id'::uuid AND product_id = :product_id;

-- 2. Exactly what GET /analytics/inventory/products/{id}/history returns, in order.
SELECT snapshot_date, stock_quantity
FROM inventory
WHERE business_id = :'business_id'::uuid AND product_id = :product_id
ORDER BY snapshot_date, inventory_id;
