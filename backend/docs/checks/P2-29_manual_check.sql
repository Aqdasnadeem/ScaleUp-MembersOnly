-- P2-29: Manual anomaly detection verification
-- Run after applying db/006_create_anomalies.up.sql.

-- 1. Check anomaly counts by business and type.
SELECT
    business_id,
    anomaly_type,
    COUNT(*) AS anomaly_count
FROM anomalies
GROUP BY business_id, anomaly_type
ORDER BY business_id, anomaly_type;

-- 2. Review the latest detected anomalies.
SELECT
    anomaly_id,
    business_id,
    anomaly_type,
    severity,
    metric_date,
    observed_value,
    expected_value,
    evidence,
    detected_at
FROM anomalies
ORDER BY detected_at DESC
LIMIT 20;

-- 3. Check that each anomaly belongs to an existing business.
SELECT a.anomaly_id, a.business_id
FROM anomalies a
LEFT JOIN businesses b ON b.business_id = a.business_id
WHERE b.business_id IS NULL;

-- Expected result for check 3: zero rows.

-- 4. Check for duplicate anomaly keys.
SELECT
    business_id,
    anomaly_type,
    metric_date,
    subject_key,
    COUNT(*) AS duplicate_count
FROM anomalies
GROUP BY business_id, anomaly_type, metric_date, subject_key
HAVING COUNT(*) > 1;

-- Expected result for check 4: zero rows.
