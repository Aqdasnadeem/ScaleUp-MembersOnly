# Pull request texts (copy into each PR; add the evidence the ticket asks for)
No `Co-Authored-By` or AI trailer in commits or PRs. Commit as yourself.

## P2-11 Upload API + import job record (Humna)
Adds `POST /uploads`, `POST /uploads/preview`, `GET /uploads/{id}`.
- Business always from the JWT (`current_business_id` in `app/auth.py`, part of P2-08-BE).
- Wrong type, oversize and unusable files are refused before a job exists.
- Same content under another name is detected by hash: 409 with `choose: skip|replace`; `skip` works, `replace` returns 501 (see README decision 4).
Evidence to attach: `docs/API_EXAMPLES.md` (curl: 202 + job_id in 0.03 s for a 10,000-row file; GET status before and after) and `docs/results_test_api.txt` (13 tests passing).
Closes #<P2-11 issue>

## P2-12 Pydantic validation with row-level errors (Humna)
One Pydantic model per upload type; one bad row = one `{row, column, reason}` entry; good rows are kept; wrong or missing columns are reported by name before any row is read.
Evidence: `sample/bad_sales.csv` + `sample/bad_sales_errors.json` (the JSON of row/column errors), `docs/results_test_validation.txt` (15 tests, including 19/20/21% bad rows).
Closes #<P2-12 issue>

## P2-13 Cleaning and transformation rules (Alishba)
Rules C1-C10 in `app/cleaning.py` and `app/transform.py`.
Evidence: `docs/CLEANING_RULES.md` (every rule with before/after and the date convention), `docs/results_test_cleaning.txt` (51 tests).
Closes #<P2-13 issue>

## P2-14 Bulk load (Alishba)
COPY into a staging table, then INSERT ... ON CONFLICT DO NOTHING in one transaction. Load only: taking the job and marking it done/failed belongs to P2-51 (`app/worker.py`).
Evidence: `docs/results_test_loader.txt`: 10,000 rows loaded in 0.6 s (limit 30 s); the same file again adds 0 rows (10,000 skipped); a failure in the middle leaves no partial data; a retry adds each row once.
Closes #<P2-14 issue>

## P2-51 Background worker (Aqdas)
`app/worker.py`: takes the oldest pending job (`FOR UPDATE SKIP LOCKED`), runs validate -> clean -> load (`app/pipeline.py`), marks it completed / completed_with_warnings / failed. Retry only temporary failures (lost DB connection, deadlock), 3 attempts in total, waits 2 s then 4 s. A bad CSV fails at once (no retry). A retry cannot duplicate rows (one transaction, `ON CONFLICT DO NOTHING`).
Evidence: `docs/results_test_worker.txt` (6 tests: oldest first; end to end; bad CSV = 1 attempt; connection lost twice AFTER the load -> still exactly 5 rows; 3 failures -> failed with message, 0 rows, exactly 3 tries; crash recovery), `docs/WORKER_DEMO.md` (real run: POST /uploads, status pending -> processing -> completed, 10,000 rows, no manual command).
Depends on P2-07, P2-11 to P2-14. Open for deploy (M7): the CSV must be readable by the worker (shared disk or stored in the database).

## Added on 5 Nov (audit against the SRS), for P2-11 and P2-14
- P2-11: `GET /uploads/template/{upload_type}` returns a header-only CSV template (FR-UP-06). Needs a login. Test: `test_templates_are_offered_for_all_four_types_need_a_login_and_map_completely`.
- P2-14: the job status now follows BR-12 exactly: `completed_with_warnings` only when a row was rejected. Skipped duplicates and merged lines stay in `message`. `tests/test_parity.py` was updated for this one deliberate difference from the old prototype.
- `backend/.gitignore` added (`.env`, `uploads/`, `__pycache__`, `.pytest_cache`).
- Replace stays 501 at the API in M3 (loader is built and tested); see SRS OI-9.

## Added on 5 Nov (frontend needs)
- `GET /uploads`: upload history for the History screen (newest first, this business only, no error report). Test: `test_history_lists_only_my_jobs_newest_first_without_the_error_report`.
- Header synonyms: `sku id` for the product code and `current stock` for the stock quantity, so the mockup's demo CSV headers map by themselves.

## Added on 5 Nov (sir's answers)
- Dates: latest allowed date = today in Asia/Karachi (`DATE_TZ`), earliest 2000-01-01, both in config.
- Returns (negative quantity): `returned_rows` on the job, not loaded, outside the 20% rule, value in the message. Quantity 0 stays a bad row.
- cost_price: still fill-only; a different cost in a new file adds "Warning: N products have a different cost" to the job message.
- Migration 001 now also has `ingestion_jobs.file_key`, `returned_rows`, `skipped_rows`, `started_at`. No `users.role` (one role only; sir, 5 Nov). `scripts/create_demo_users.py` creates two Business users in two businesses.
- Worker: two workers never take the same job (test with a locked row); a job stuck in `processing` for more than 15 minutes is put back to `pending` by any worker. `GET /uploads/{id}` shows loaded, skipped and rejected rows.
- Tests: `tests/test_returns_cost_role.py` (9), date tests in `tests/test_cleaning.py`; parity test knows the two deliberate differences from the prototype.

## P2-07 (rejected_rows, added 5 Nov, sir)
- Migration 002 now has `rejected_rows` (row_number, column_name, reason, business_id, job_id); index `idx_rejected_job` in 003. `pipeline.save_rejected` writes the bad rows in the same transaction as the load (at most 1,000 per job); a re-run of a job first deletes its earlier rows; failed jobs keep theirs. `ingestion_jobs.error_report` (JSON) is still filled for the API.
- Tests: 3 in `tests/test_returns_cost_role.py`. ERD (11 tables) and data dictionary updated; `verify.py`: 91 columns, 21 foreign keys, 11 primary keys.
