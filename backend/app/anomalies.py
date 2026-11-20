"""P2-29: Business-scoped anomaly detection."""

import json
import logging
import statistics
import uuid
from datetime import date, timedelta
from decimal import Decimal

import psycopg2

logger = logging.getLogger(__name__)

MIN_POINTS = 14
Z_THRESHOLD = 3.0
BASELINE_DAYS = 28


def _save_anomaly(
    conn,
    business_id,
    anomaly_type,
    metric_date,
    observed,
    expected,
    severity,
    evidence,
    subject_key="",
):
    """Insert or update an anomaly without creating duplicates."""
    cur = conn.cursor()
    cur.execute(
        """
        INSERT INTO anomalies (
            business_id, anomaly_type, severity, metric_date,
            observed_value, expected_value, evidence, subject_key
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s)
        ON CONFLICT (business_id, anomaly_type, metric_date, subject_key)
        DO UPDATE SET
            severity = EXCLUDED.severity,
            observed_value = EXCLUDED.observed_value,
            expected_value = EXCLUDED.expected_value,
            evidence = EXCLUDED.evidence,
            detected_at = now()
        RETURNING anomaly_id
        """,
        (
            business_id,
            anomaly_type,
            severity,
            metric_date,
            observed,
            expected,
            json.dumps(evidence, default=str),
            subject_key,
        ),
    )
    row = cur.fetchone()
    return row[0]


def detect_sales_anomalies(conn, business_id):
    """Detect unusual daily revenue using the previous 28 calendar days."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT sale_date, SUM(total_amount)
        FROM sales
        WHERE business_id = %s
        GROUP BY sale_date
        ORDER BY sale_date
        """,
        (business_id,),
    )
    daily = {row[0]: Decimal(str(row[1])) for row in cur.fetchall()}

    if not daily:
        return 0

    saved = 0

    for target_date in sorted(daily):
        baseline_start = target_date - timedelta(days=BASELINE_DAYS)
        baseline = [
            float(daily.get(baseline_start + timedelta(days=i), 0))
            for i in range(BASELINE_DAYS)
        ]

        # Require at least 14 actual sales days in the previous 28 days.
        actual_points = sum(
            1 for day in daily
            if baseline_start <= day < target_date
        )
        if actual_points < MIN_POINTS:
            continue

        # Missing calendar days count as zero revenue in the baseline.
        observations = baseline
        mean_value = statistics.mean(observations)
        std_value = statistics.pstdev(observations)

        if std_value == 0:
            continue

        observed = float(daily[target_date])
        z_score = (observed - mean_value) / std_value

        if abs(z_score) < Z_THRESHOLD:
            continue

        severity = "critical" if abs(z_score) >= 4 else "warning"
        evidence = {
            "mean": mean_value,
            "std": std_value,
            "z_score": z_score,
            "series": [
                {
                    "date": (baseline_start + timedelta(days=i)).isoformat(),
                    "revenue": baseline[i],
                }
                for i in range(BASELINE_DAYS)
            ],
        }

        _save_anomaly(
            conn,
            business_id,
            "sales",
            target_date,
            observed,
            mean_value,
            severity,
            evidence,
        )
        saved += 1

    return saved


def detect_inventory_anomalies(conn, business_id):
    """Detect stock decreases of at least 50 percent and 10 units."""
    cur = conn.cursor()
    cur.execute(
        """
        SELECT product_id, snapshot_date, stock_quantity
        FROM inventory
        WHERE business_id = %s
        ORDER BY product_id, snapshot_date
        """,
        (business_id,),
    )

    snapshots = {}
    for product_id, snapshot_date, quantity in cur.fetchall():
        snapshots.setdefault(product_id, []).append(
            (snapshot_date, quantity)
        )

    saved = 0

    for product_id, records in snapshots.items():
        for previous, current in zip(records, records[1:]):
            previous_date, previous_qty = previous
            current_date, current_qty = current

            decrease = previous_qty - current_qty

            if previous_qty <= 0:
                continue

            drop_pct = decrease / previous_qty * 100

            if decrease < 10 or drop_pct < 50:
                continue

            evidence = {
                "product_id": product_id,
                "previous_date": previous_date.isoformat(),
                "current_date": current_date.isoformat(),
                "previous_quantity": previous_qty,
                "current_quantity": current_qty,
                "decrease_units": decrease,
                "drop_percentage": drop_pct,
            }

            _save_anomaly(
                conn,
                business_id,
                "inventory",
                current_date,
                current_qty,
                previous_qty,
                "critical",
                evidence,
                subject_key=str(product_id),
            )
            saved += 1

    return saved


def detect_expense_anomalies(conn, business_id):
    """Use Aqdas's shared expense flagging function when available."""
    try:
        from .expense_flags import flag_categories
    except ImportError:
        logger.warning(
            "Expense anomaly detection skipped: expense_flags integration unavailable"
        )
        return 0

    cur = conn.cursor()
    cur.execute(
        """
        SELECT DISTINCT date_trunc('month', expense_date)::date
        FROM expenses
        WHERE business_id = %s
        ORDER BY 1
        """,
        (business_id,),
    )
    months = [row[0] for row in cur.fetchall()]
    saved = 0

    for month in months:
        flagged = flag_categories(conn, business_id, month)

        if not flagged:
            continue

        for item in flagged:
            if isinstance(item, dict):
                category = item.get("category")
                observed = item.get("observed", 0)
                expected = item.get("expected", 0)
            else:
                category = str(item)
                observed = 0
                expected = 0

            if not category:
                continue

            evidence = {
                "category": category,
                "month": month.isoformat(),
            }

            _save_anomaly(
                conn,
                business_id,
                "expense",
                month,
                observed,
                expected,
                "warning",
                evidence,
                subject_key=str(category),
            )
            saved += 1

    return saved


def run_detection(conn, business_id):
    """Run all anomaly detectors for one business. Each detector commits on its own, so one
    detector raising (sir, 18 Nov) never rolls back or blocks the other two; the failure is
    logged and that detector's count stays 0."""
    business_id = str(business_id)

    result = {
        "sales": 0,
        "inventory": 0,
        "expense": 0,
    }

    for name, detect in (
        ("sales", detect_sales_anomalies),
        ("inventory", detect_inventory_anomalies),
        ("expense", detect_expense_anomalies),
    ):
        try:
            result[name] = detect(conn, business_id)
            conn.commit()
        except Exception:
            conn.rollback()
            logger.warning("%s anomaly detection failed for business %s", name, business_id, exc_info=True)

    result["total"] = sum(result.values())
    return result


def run_all_businesses():
    """Run detection for every business."""
    from .db import connect

    conn = connect()
    try:
        cur = conn.cursor()
        cur.execute("SELECT business_id FROM businesses ORDER BY business_id")
        business_ids = [row[0] for row in cur.fetchall()]
        results = {}

        for business_id in business_ids:
            results[str(business_id)] = run_detection(conn, business_id)

        return results
    finally:
        conn.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(run_all_businesses(), indent=2, default=str))
