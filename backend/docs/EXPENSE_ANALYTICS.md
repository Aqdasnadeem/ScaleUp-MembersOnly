# Expense Analytics (P2-27 and P2-28)

All expense analytics endpoints require a bearer token. The business scope is
read from the verified token; clients cannot choose a `business_id`.

## Category totals and drill-down

`GET /expenses/categories?month=YYYY-MM` returns expense totals for the
requested calendar month and the preceding calendar month. `percentage_change`
is `(current - previous) / previous * 100`, rounded to two decimal places. It
is `null` when the previous category total is unavailable or zero; a missing
category/month is not assumed to be zero.

`GET /expenses/categories/{category}/entries?month=YYYY-MM&limit=100&offset=0`
returns the category's stored entries for that month, ordered newest first.
`limit` is between 1 and 500, `offset` is zero or greater, and both are echoed
in the response. A month outside the selected calendar month is not included.

Category names are matched case-insensitively after trimming leading and
trailing whitespace. The summary groups the same normalized names, so `Rent`,
` rent ` and `RENT` are reported as one category. Only positive, non-NaN amounts
are included; zero or negative amounts are never aggregated or returned. The
summary lists the categories that have expenses in the selected month, so a
category that exists only in the previous month is not returned.

## Unusual increase rule (P2-28)

A category is flagged as an unusual increase when **both** of the following
conditions are met, comparing the selected month to the immediately preceding
calendar month:

1. **Percentage increase** exceeds 50%.
2. **Absolute rupee increase** exceeds the configured minimum threshold.

The minimum rupee threshold is configured via the `EXPENSE_RUPEE_THRESHOLD`
environment variable. **No approved value exists in the project requirements.**
Advisor confirmation is required to set this value. The current implementation
requires this variable to be set; it will raise an error if missing.

The current, still-open calendar month is not evaluated. The category must have
recorded expense entries in both the selected month and the previous month, and
both months must have expense rows associated only with `completed` ingestion
jobs that have no rejected rows. Missing values are never replaced with zero.

No flag is produced for insufficient history, a missing category/month,
incomplete imports, or a zero/non-positive previous month amount.
`unusual_increase` is `null` when the category cannot be evaluated;
`anomaly_status` explains why. For evaluated categories it is a boolean, and
`anomaly_score` is the percentage increase.

### Threshold justification

- **Percentage threshold (50%)**: Specified in the P2-28 requirements document.
- **Rupee threshold**: No approved value exists in project requirements or
  configuration. The `EXPENSE_RUPEE_THRESHOLD` environment variable must be set
  by the deployment environment after advisor/business confirmation. The
  repository seed data contains only a single month of expenses (October 2026)
  and cannot establish a statistically valid minimum rupee increase.

The shared function `app.expense_flags.flag_categories(conn, business_id,
month)` returns only flagged dictionaries with `category`, `observed`,
`expected` (previous month amount), `percentage_increase`, and `rupee_increase`
fields. This matches the integration contract used by P2-29's expense anomaly
detector.