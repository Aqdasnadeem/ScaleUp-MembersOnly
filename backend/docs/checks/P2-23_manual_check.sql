-- P2-23-BE: Manual verification of sales KPIs and revenue trend.
-- Replace the UUID below with a real business_id from your test database.

\set business_id '00000000-0000-0000-0000-000000000000'

-- 1. Sales KPIs for the selected business and date range.
SELECT
    COALESCE(SUM(total_amount), 0) AS gross_revenue,
    COUNT(DISTINCT order_id) AS orders,
    COALESCE(SUM(quantity), 0) AS units_sold,
    CASE
        WHEN COUNT(DISTINCT order_id) = 0 THEN NULL
        ELSE ROUND(
            SUM(total_amount) / COUNT(DISTINCT order_id),
            2
        )
    END AS avg_order_value
FROM sales
WHERE business_id = :'business_id'::UUID
  AND sale_date BETWEEN DATE '2026-01-01' AND DATE '2026-03-31';

-- 2. Daily revenue.
SELECT
    sale_date AS period,
    COALESCE(SUM(total_amount), 0) AS revenue
FROM sales
WHERE business_id = :'business_id'::UUID
  AND sale_date BETWEEN DATE '2026-01-01' AND DATE '2026-03-31'
GROUP BY sale_date
ORDER BY sale_date;

-- 3. Monthly revenue.
SELECT
    DATE_TRUNC('month', sale_date)::DATE AS period,
    COALESCE(SUM(total_amount), 0) AS revenue
FROM sales
WHERE business_id = :'business_id'::UUID
  AND sale_date BETWEEN DATE '2026-01-01' AND DATE '2026-03-31'
GROUP BY DATE_TRUNC('month', sale_date)
ORDER BY period;
