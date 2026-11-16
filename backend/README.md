# Scale Up backend: upload, validation, cleaning, load (tickets P2-11, P2-12, P2-13, P2-14)

FastAPI + Pydantic + PostgreSQL. Written against migrations 001-004 in `../db`. Nothing here changes the schema.

| Ticket | Owner (plan) | Files | Tests |
| --- | --- | --- | --- |
| **P2-11** Upload API + import job record | Humna | `app/routes_uploads.py`, `app/main.py`, `app/db.py`, `app/config.py` (uses `current_business_id` from P2-08-BE) | `tests/test_api.py` (13) |
| **P2-12** Pydantic validation, row-level errors | Humna | `app/schemas.py`, `app/mapping.py`, `sample/bad_sales.csv` + `sample/bad_sales_errors.json` | `tests/test_validation.py` (15) |
| **P2-13** Cleaning and transformation rules | Alishba | `app/cleaning.py`, `app/transform.py`, `docs/CLEANING_RULES.md` | `tests/test_cleaning.py` (51) |
| **P2-14** Bulk load | Alishba | `app/loader.py` | `tests/test_loader.py` (14) |
| **P2-08-BE** Login + business-scoped access | Humna | `app/routes_auth.py`, `app/auth.py`, `app/security.py`, `app/main.py` (CORS) | `tests/test_auth.py` (9), `docs/AUTH_EXAMPLES.md` |
| **P2-51** Background worker | Aqdas | `app/worker.py` (take next job, run, retry temporary failures max 3, mark done/failed), `app/pipeline.py` (one job start to finish) | `tests/test_worker.py` (6), `docs/WORKER_DEMO.md` |

Safety net: `tests/test_parity.py` runs every CSV of the prototype test data through the old prototype and through these modules; status, loaded rows, bad rows (row, column, reason), table counts and revenue are identical on all 62 readable files (the other 6 are binary/empty files the prototype refuses).

## Run the tests (Windows, PowerShell)
```powershell
cd backend
py -m pip install -r requirements.txt
$env:PGHOST = "localhost"; $env:PGPORT = "5432"; $env:PGUSER = "postgres"
$env:PGPASSWORD = Read-Host "postgres password"
py -m pytest tests -q
```
It creates and drops only the database `scaleup_backend_test` (migrations are read from `../db`). Last result here: **192 passed, 6 skipped**. The 6 skipped are binary files in the parity test (`results_*.txt` in `docs/`).

## Run the API by hand
```powershell
$env:PGDATABASE = "scaleup_dev"; $env:JWT_SECRET = "<a long random string>"; $env:CORS_ORIGINS = "http://localhost:3000"
py -m uvicorn app.main:app --reload      # docs at http://localhost:8000/docs
py -m app.worker                         # the worker: leave it running in a second PowerShell window
```
Real curl output: `docs/API_EXAMPLES.md`.

## Sales analytics (P2-23-BE)

`GET /analytics/sales?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD&interval=daily|monthly`
requires a bearer token. Dates are inclusive; the business is taken only from the token.
The response contains gross revenue, distinct order count, average order value, and
the requested daily or monthly series, all calculated from persisted sales records.

`GET /analytics/products?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD` compares
product gross revenue against the immediately preceding period of equal length.
Margin is `(gross revenue - quantity * product cost) / gross revenue * 100`;
it is null when cost is missing or revenue is zero. Product costs are the current
fill-only costs stored on products, not historical costs.

## Inventory alerts (local P2-25 implementation)

`GET /analytics/inventory/alerts` lists products whose latest inventory snapshot is
zero or below the business's `low_stock_threshold`. `GET
/analytics/inventory/products/{product_id}` returns that business-owned product's
latest snapshot. Both require a bearer token. A stockout is included even if the
threshold is zero; products without a snapshot are not assumed to be out of stock.

`GET /analytics/inventory/products` lists products with inventory snapshots.
`GET /analytics/inventory/products/{product_id}/history` returns that product's
persisted snapshots in chronological order, scoped to the authenticated business.
These are stock levels on recorded dates, not inferred transactions between dates.

## Expense analytics (local P2-27 implementation)

Authenticated `GET /analytics/expenses?month=YYYY-MM` compares category totals for
the selected calendar month with the previous calendar month. The percentage is
null when the previous total is zero. Categories present only in the previous month
are included with a current total of zero. `GET /analytics/expenses/entries?month=YYYY-MM&category=...`
returns the selected month's individual entries for that category. Both endpoints
read persisted expenses scoped to the authenticated business. These local endpoints
may need alignment with the official P2-27-BE contract when it is available.

## Anomalies (local P2-30 dependency)

Authenticated `GET /analytics/anomalies?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
computes comparisons on demand for the inclusive range, with optional `type=sales`,
`expenses`, or `inventory`. A change of at least 50% is reported only when its
reference is positive. Sales compare each day's revenue with the average of recorded
sales days in the prior seven calendar days (at least three recorded days required).
Expenses compare a category's monthly total with its previous recorded calendar
month; the end month may be incomplete. Inventory compares each product snapshot
with its prior snapshot. Evidence contains the actual compared values.
These provisional local calculations do not implement P2-29's scheduled job or
persist anomaly results and may need to be replaced when its official API is available.

## Decisions you must know about
1. **Login (P2-08-BE) is in this folder now:** `app/routes_auth.py` (`POST /auth/signup`, `POST /auth/login`, `GET /auth/me`), `app/auth.py` (JWT with `business_id`, valid 60 min as NFR-SEC-02 says), `app/security.py` (scrypt salted hash). Every other router takes the business only from the token. Not done: rate limiting of login attempts, password reset, refresh tokens.
2. **The worker (P2-51) is `app/worker.py`.** Start it next to the API: `py -m app.worker` (keeps polling every 2 s; `--once` = one job). Bad CSV fails at once; only temporary problems (lost DB connection, deadlock) are retried, 3 attempts in total; the load is one transaction and skips existing rows, so a retry cannot duplicate rows. Two workers never take the same job (`FOR UPDATE SKIP LOCKED`); a job left in `processing` by a crash is put back to `pending` after 15 minutes by any worker. Limits: the uploaded file must be on the same machine/disk as the worker (open question for deploy, M7).
3. **Mapping:** `POST /uploads/preview` (extra endpoint, needed by the mapping screen of P2-10) returns the columns and the suggested/saved mapping and creates nothing. `POST /uploads` accepts `mapping` (JSON), else uses the saved one, else the auto-suggestion; the confirmed mapping is saved per business and file type.
4. **Replace** is implemented in the load step (`loader.remove_job_rows`, tested) but the API answers 501 for `on_duplicate=replace`: the job has no column that says which upload it replaces. Needs one new nullable column (`ingestion_jobs.replaces_job_id`, a small migration 004) or another place to keep it. Called OI-9 in the code and docs; it is NOT yet listed in the SRS open-issues table (add it there, or ask sir first).
5. **Returns (changed 5 Nov, sir):** a negative quantity is a return: counted in `returned_rows`, not loaded, outside the 20% limit; revenue is gross. **Cost warning:** a different cost in a later file keeps the saved cost and adds a warning to the job message. **Dates:** latest allowed = today in Asia/Karachi (needs the `tzdata` package on Windows; it is in `requirements.txt`). **`file_key`** on `ingestion_jobs` = where the original file is kept. **One role only** (Business user): no `users.role`. `py scripts/create_demo_users.py` makes two Business users in two different businesses and shows that one cannot open the other's job. **`skipped_rows`** is shown by `GET /uploads/{id}`; **`started_at`** lets any worker put a job stuck in `processing` for more than 15 minutes (`WORKER_STUCK_MINUTES`) back to `pending`.
6. **Not covered:** several warehouses (inventory key is product + date, OI-6), cross-business foreign keys (the loader always filters by `business_id`).
