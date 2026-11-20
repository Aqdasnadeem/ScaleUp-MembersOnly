-- P2-24: Product Performance Ranking manual verification
-- Replace the values below with a real business UUID and test dates.

\set business_id 'YOUR-BUSINESS-UUID'
\set date_from '2026-01-10'
\set date_to '2026-01-11'

-- 1. Current-period product revenue, units and margin.
WITH current_sales AS (
    SELECT
        product_id,
        SUM(total_amount) AS revenue,
        SUM(quantity) AS units
    FROM sales
    WHERE business_id = :'business_id'::uuid
      AND sale_date BETWEEN :'date_from'::date AND :'date_to'::date
    GROUP BY product_id
)
SELECT
    p.product_id,
    p.product_key,
    p.product_name,
    cs.revenue,
    cs.units,
    p.cost_price,
    CASE
        WHEN p.cost_price IS NULL THEN NULL
        ELSE cs.revenue - (cs.units * p.cost_price)
    END AS margin,
    CASE
        WHEN p.cost_price IS NULL OR cs.revenue = 0 THEN NULL
        ELSE ROUND(
            ((cs.revenue - (cs.units * p.cost_price))
             / cs.revenue) * 100, 2
        )
    END AS margin_pct
FROM products p
JOIN current_sales cs ON cs.product_id = p.product_id
WHERE p.business_id = :'business_id'::uuid
ORDER BY cs.revenue DESC;

-- 2. Previous-period revenue and units.
WITH date_range AS (
    SELECT
        :'date_from'::date AS current_from,
        :'date_to'::date AS current_to
),
previous_sales AS (
    SELECT
        s.product_id,
        SUM(s.total_amount) AS previous_revenue,
        SUM(s.quantity) AS previous_units
    FROM sales s
    CROSS JOIN date_range d
    WHERE s.business_id = :'business_id'::uuid
      AND s.sale_date BETWEEN
          (d.current_from - (d.current_to - d.current_from + 1))
          AND (d.current_from - 1)
    GROUP BY s.product_id
)
SELECT
    p.product_key,
    COALESCE(ps.previous_revenue, 0) AS previous_revenue,
    COALESCE(ps.previous_units, 0) AS previous_units
FROM products p
JOIN previous_sales ps ON ps.product_id = p.product_id
WHERE p.business_id = :'business_id'::uuid
ORDER BY previous_revenue DESC;

-- 3. Count products without cost in the current period.
SELECT COUNT(DISTINCT s.product_id) AS products_without_cost
FROM sales s
JOIN products p
  ON p.product_id = s.product_id
 AND p.business_id = s.business_id
WHERE s.business_id = :'business_id'::uuid
  AND s.sale_date BETWEEN :'date_from'::date AND :'date_to'::date
  AND p.cost_price IS NULL;
