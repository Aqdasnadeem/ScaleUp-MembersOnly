"""P2-28 expense-category anomaly analysis and P2-29 integration."""
import datetime as dt
from decimal import Decimal
import os

from . import config

HISTORY_MONTHS = 6
PERCENTAGE_THRESHOLD = Decimal("50")
# Minimum rupee threshold for unusual increase detection.
# REQUIRES ADVISOR CONFIRMATION: No approved value exists in project requirements.
# Set EXPENSE_RUPEE_THRESHOLD environment variable to configure.
# Example: EXPENSE_RUPEE_THRESHOLD=1000
def _min_rupee_threshold() -> Decimal:
    value = os.environ.get("EXPENSE_RUPEE_THRESHOLD")
    if value is None:
        raise RuntimeError(
            "EXPENSE_RUPEE_THRESHOLD environment variable must be set. "
            "No approved minimum rupee threshold exists in project requirements. "
            "Advisor confirmation required."
        )
    return Decimal(value)


def _month_start(value: dt.date) -> dt.date:
    return value.replace(day=1)


def _shift_month(month: dt.date, offset: int) -> dt.date:
    ordinal = month.year * 12 + month.month - 1 + offset
    return dt.date(ordinal // 12, ordinal % 12 + 1, 1)


def _load_monthly_data(conn, business_id, start: dt.date, end: dt.date):
    cur = conn.cursor()
    cur.execute(
        """
        SELECT date_trunc('month', e.expense_date)::date,
               lower(btrim(e.category)),
               SUM(e.amount),
               BOOL_AND(COALESCE(
                   j.status = 'completed' AND j.rejected_rows = 0,
                   FALSE
               ))
        FROM expenses e
        LEFT JOIN ingestion_jobs j
          ON j.job_id = e.job_id AND j.business_id = e.business_id
        WHERE e.business_id = %s
          AND e.expense_date >= %s
          AND e.expense_date < %s
          AND e.amount > 0
          AND e.amount <> 'NaN'::NUMERIC
          AND length(btrim(e.category)) > 0
        GROUP BY 1, 2
        ORDER BY 1, 2
        """,
        (business_id, start, end),
    )

    totals = {}
    coverage = {}
    for month, category, amount, complete in cur.fetchall():
        totals.setdefault(month, {})[category] = amount
        coverage[month] = coverage.get(month, True) and bool(complete)
    return totals, coverage


def _analyze_month(month, totals, coverage):
    current = totals.get(month, {})
    if not current:
        return {}

    previous_month = _shift_month(month, -1)
    if month >= _month_start(config.today_local()):
        status = "incomplete_data"
        reason = "The selected calendar month is not complete."
    elif not coverage.get(month, False):
        status = "incomplete_data"
        reason = "The selected month includes an incomplete or rejected expense import."
    else:
        status = None
        reason = None

    analysis = {}
    for category, observed in current.items():
        result = {
            "category": category,
            "observed": observed,
            "expected": None,
            "percentage_increase": None,
            "rupee_increase": None,
            "flagged": False,
            "status": status,
            "explanation": reason,
        }
        if status:
            analysis[category] = result
            continue

        if previous_month not in totals:
            result.update(
                status="insufficient_history",
                explanation="Previous month data is required for month-over-month comparison.",
            )
            analysis[category] = result
            continue
        if not coverage.get(previous_month, False):
            result.update(
                status="incomplete_data",
                explanation="Previous month includes an incomplete or rejected expense import.",
            )
            analysis[category] = result
            continue
        if category not in totals[previous_month]:
            result.update(
                status="insufficient_history",
                explanation="The category is missing from the previous month; missing months are not treated as zero.",
            )
            analysis[category] = result
            continue

        previous_amount = totals[previous_month][category]
        if previous_amount <= 0:
            result.update(
                status="insufficient_history",
                explanation="Previous month amount must be positive to compute percentage change.",
            )
            analysis[category] = result
            continue

        percentage_increase = ((observed - previous_amount) * Decimal("100") / previous_amount).quantize(
            Decimal("0.01")
        )
        rupee_increase = observed - previous_amount

        flagged = (
            percentage_increase > PERCENTAGE_THRESHOLD
            and rupee_increase > _min_rupee_threshold()
        )

        result.update(
            expected=previous_amount,
            percentage_increase=percentage_increase,
            rupee_increase=rupee_increase,
            flagged=flagged,
            status="flagged" if flagged else "normal",
            explanation=(
                f"Spending increased by {percentage_increase}% (PKR {rupee_increase}), exceeding both the {PERCENTAGE_THRESHOLD}% and PKR {_min_rupee_threshold()} thresholds."
                if flagged
                else "Spending is within the normal month-over-month range."
            ),
        )
        analysis[category] = result
    return analysis


def analyze_categories(conn, business_id, month: dt.date):
    """Return a status and anomaly metrics for each category in a month."""
    month = _month_start(month)
    start = _shift_month(month, -HISTORY_MONTHS)
    end = _shift_month(month, 1)
    totals, coverage = _load_monthly_data(conn, business_id, start, end)
    return _analyze_month(month, totals, coverage)


def flag_categories(conn, business_id, month: dt.date):
    """Return the P2-29-compatible list of category anomalies for one month."""
    return [
        {
            "category": item["category"],
            "observed": item["observed"],
            "expected": item["expected"],
            "percentage_increase": item["percentage_increase"],
            "rupee_increase": item["rupee_increase"],
        }
        for item in analyze_categories(conn, business_id, month).values()
        if item["flagged"]
    ]


def category_summary(conn, business_id, month: dt.date):
    """Return current and previous month totals, plus P2-28 status, by category."""
    month = _month_start(month)
    previous_month = _shift_month(month, -1)
    start = _shift_month(month, -HISTORY_MONTHS)
    end = _shift_month(month, 1)
    totals, coverage = _load_monthly_data(conn, business_id, start, end)
    current = totals.get(month, {})
    previous = totals.get(previous_month, {})
    analysis = _analyze_month(month, totals, coverage)

    items = []
    for category in sorted(current):
        current_amount = current[category]
        previous_amount = previous.get(category)
        percentage_change = None
        if previous_amount is not None and previous_amount > 0:
            percentage_change = (
                (current_amount - previous_amount)
                * Decimal("100")
                / previous_amount
            ).quantize(Decimal("0.01"))

        result = analysis[category]
        items.append(
            {
                "category": category,
                "total_amount": current_amount,
                "previous_month_total": previous_amount,
                "percentage_change": percentage_change,
                "unusual_increase": (
                    result["flagged"]
                    if result["status"] in ("normal", "flagged")
                    else None
                ),
                "anomaly_status": result["status"],
                "anomaly_score": result["percentage_increase"],
                "anomaly_explanation": result["explanation"],
            }
        )

    return {
        "month": month.isoformat()[:7],
        "previous_month": previous_month.isoformat()[:7],
        "items": items,
    }


def category_entries(
    conn,
    business_id,
    month: dt.date,
    category: str,
    limit: int,
    offset: int,
):
    """Return one business's expense entries for a category and month."""
    month = _month_start(month)
    next_month = _shift_month(month, 1)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT expense_id, expense_date, category, amount, description
        FROM expenses
        WHERE business_id = %s
          AND expense_date >= %s
          AND expense_date < %s
          AND lower(btrim(category)) = %s
          AND amount > 0
          AND amount <> 'NaN'::NUMERIC
        ORDER BY expense_date DESC, expense_id DESC
        LIMIT %s OFFSET %s
        """,
        (business_id, month, next_month, category, limit, offset),
    )
    return [
        {
            "expense_id": expense_id,
            "expense_date": expense_date.isoformat(),
            "category": stored_category,
            "amount": amount,
            "description": description,
        }
        for expense_id, expense_date, stored_category, amount, description in cur.fetchall()
    ]