# P2-29 Anomaly Detection Method

## 1. Sales Revenue Anomalies

- Metric: daily revenue calculated using SUM(sales.total_amount).
- Baseline: previous 28 calendar days for the same business.
- Minimum observations: 14 days.
- Method: z-score.
- Formula: z = (observed_revenue - baseline_mean) / baseline_std_dev.
- Threshold: absolute z-score >= 3.
- Positive z-score indicates an unusual increase; negative indicates an unusual decrease.
- Skip detection when baseline standard deviation is zero or fewer than 14 observations exist.
- The anomaly evidence stores the baseline mean, standard deviation, z-score and daily revenue series.

## 2. Inventory Stock Drop

- Compare consecutive inventory snapshots for the same business and product.
- Detect a stock drop when both conditions are true:
  - The decrease is at least 50% of the previous stock quantity.
  - The absolute decrease is at least 10 units.
- Ignore unchanged or increased stock.
- Evidence stores previous quantity, current quantity, previous date and current date.

## 3. Expense Category Anomalies

- Expense detection uses the shared Aqdas function:
  `expense_flags.flag_categories(conn, business_id, month)`.
- Store each category flagged as unusual by that function.
- Do not duplicate or replace Aqdas's expense classification rules.
- If the shared function is not yet available, expense detection must safely skip and log the unavailable integration.

## 4. Storage and Idempotency

- Every anomaly is scoped to a business.
- Unique key: business_id, anomaly_type and metric_date.
- Repeated detection updates the existing record instead of creating duplicates.
- Evidence is stored as JSONB.
- API percentage size is calculated as:
  `(observed_value - expected_value) / expected_value * 100`.
- If expected_value is zero, percentage size is null.
