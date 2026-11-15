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

## Decisions you must know about
1. **Login (P2-08-BE) is in this folder now:** `app/routes_auth.py` (`POST /auth/signup`, `POST /auth/login`, `GET /auth/me`), `app/auth.py` (JWT with `business_id`, valid 60 min as NFR-SEC-02 says), `app/security.py` (scrypt salted hash). Every other router takes the business only from the token. Not done: rate limiting of login attempts, password reset, refresh tokens.
2. **The worker (P2-51) is `app/worker.py`.** Start it next to the API: `py -m app.worker` (keeps polling every 2 s; `--once` = one job). Bad CSV fails at once; only temporary problems (lost DB connection, deadlock) are retried, 3 attempts in total; the load is one transaction and skips existing rows, so a retry cannot duplicate rows. Two workers never take the same job (`FOR UPDATE SKIP LOCKED`); a job left in `processing` by a crash is put back to `pending` after 15 minutes by any worker. Limits: the uploaded file must be on the same machine/disk as the worker (open question for deploy, M7).
3. **Mapping:** `POST /uploads/preview` (extra endpoint, needed by the mapping screen of P2-10) returns the columns and the suggested/saved mapping and creates nothing. `POST /uploads` accepts `mapping` (JSON), else uses the saved one, else the auto-suggestion; the confirmed mapping is saved per business and file type.
4. **Replace** is implemented in the load step (`loader.remove_job_rows`, tested) but the API answers 501 for `on_duplicate=replace`: the job has no column that says which upload it replaces. Needs one new nullable column (`ingestion_jobs.replaces_job_id`, a small migration 004) or another place to keep it. Called OI-9 in the code and docs; it is NOT yet listed in the SRS open-issues table (add it there, or ask sir first).
5. **Returns (changed 5 Nov, sir):** a negative quantity is a return: counted in `returned_rows`, not loaded, outside the 20% limit; revenue is gross. **Cost warning:** a different cost in a later file keeps the saved cost and adds a warning to the job message. **Dates:** latest allowed = today in Asia/Karachi (needs the `tzdata` package on Windows; it is in `requirements.txt`). **`file_key`** on `ingestion_jobs` = where the original file is kept. **One role only** (Business user): no `users.role`. `py scripts/create_demo_users.py` makes two Business users in two different businesses and shows that one cannot open the other's job. **`skipped_rows`** is shown by `GET /uploads/{id}`; **`started_at`** lets any worker put a job stuck in `processing` for more than 15 minutes (`WORKER_STUCK_MINUTES`) back to `pending`.
6. **Not covered:** several warehouses (inventory key is product + date, OI-6), cross-business foreign keys (the loader always filters by `business_id`).
