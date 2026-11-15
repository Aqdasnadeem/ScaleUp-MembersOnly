# API contract (docs/CONTRACT.md): what frontend and backend agree on
Tickets that list this file as a dependency: P2-08-BE/-FE, P2-09, P2-10, P2-11, P2-12, P2-51. Machine-readable copy: `openapi.json` (also live at `/docs`). Source of truth is the code in `backend/app`; if they differ, fix this file.

General: JSON in and out (uploads are multipart). Every call except `/auth/signup` and `/auth/login` needs `Authorization: Bearer <access_token>`. The business is read from the token, never sent by the client. A token is valid for 60 minutes (NFR-SEC-02); after that every call answers 401 and the app sends the user to the login screen. CORS: the frontend origin must be listed in `CORS_ORIGINS` (default `http://localhost:3000`).
Errors have the form `{"detail": "<text>"}`; a 422 from input checks has `detail` as a list (`{"msg": ...}` items for sign-up fields, plain strings for column problems).

| Call | Send | Success | Errors |
| --- | --- | --- | --- |
| `POST /auth/signup` | JSON `business_name`, `email`, `password` (8 to 128 characters) | 201 `{access_token, token_type, business_id, business_name}` | 409 email already registered; 422 invalid email / short password / empty name |
| `POST /auth/login` | JSON `email`, `password` | 200 same body as sign-up | 401 `Incorrect email or password` (same text for a wrong password and an unknown email) |
| `GET /auth/me` | token | 200 `{business_id, business_name, currency, date_format}` | 401 |
| `POST /uploads/preview` | multipart `file`, `upload_type` | 200 `{columns, suggested_mapping, saved_mapping, fields, required, needs_snapshot_date}`; creates nothing | 401, 413, 415, 422 |
| `POST /uploads` | multipart `file`, `upload_type` (sales, inventory, expenses, feedback); optional `mapping` (JSON text `{our_field: file_column}`), `snapshot_date` (YYYY-MM-DD, inventory files without a date column), `on_duplicate` (`skip`) | 202 `{job_id, status: "pending"}` | 413 over `MAX_UPLOAD_MB` (default 50); 415 not `.csv`; 422 unusable mapping / missing required field / bad `upload_type`; 409 `{warning: "same_file_already_loaded", existing_job_id, choose: ["skip","replace"]}`; with `on_duplicate=skip` 200 `{status: "skipped", existing_job_id}`; with `on_duplicate=replace` 501 (not built, OI-9) |
| `GET /uploads` | token; optional `?limit=` (1 to 200, default 50) | 200 `{items: [{job_id, upload_type, file_name, status, total_rows, loaded_rows, rejected_rows, skipped_rows, returned_rows, message, created_at, completed_at}]}`, newest first, this business only; no `error_report` (use `GET /uploads/{job_id}`) | 401; 422 bad `limit` |
| `GET /uploads/template/{upload_type}` | token | 200 header-only CSV file (`scaleup_<type>_template.csv`); the column names are ones the auto-suggest already recognises | 401; 404 unknown type |
| `GET /uploads/{job_id}` | token | 200 `{job_id, upload_type, file_name, status, total_rows, loaded_rows, rejected_rows, skipped_rows, returned_rows, message, error_report, created_at, completed_at}` | 404 (also for another business's job), 401 |

Job `status` follows BR-12: `completed_with_warnings` only when at least one row was rejected; skipped duplicates and merged lines are explained in `message` and do not change the status. Values: `pending` (saved, waiting for the worker) -> `processing` -> `completed` / `completed_with_warnings` / `failed`. (`replaced` exists in the database for a later milestone.) `error_report` is a list of `{row, column, reason}` (max 1,000 entries; `rejected_rows` has the exact count). `message` is the plain-language note or failure reason. Rows skipped because they were already saved, and repeated lines merged, are only reported inside `message`.
Poll `GET /uploads/{job_id}` every 1 to 2 seconds until the status is `completed`, `completed_with_warnings` or `failed`.
Ticket wording note: ticket P2-51 says "queued / running / done" and `error_message`; the real names are `pending / processing / completed` and `message` + `error_report` (as in SRS FR-UP-04).

Returns (5 Nov): a sales line with a negative quantity is a return. It is counted in `returned_rows`, never loaded (revenue stays gross) and is not a bad row, so it is not in `rejected_rows` and not in the 20% limit (the limit is bad rows divided by all rows except returns). A quantity of 0 is still a bad row. `message` says how many return lines there were and their value.
Cost warning (5 Nov): if a file gives a product a different `cost_price` than the one already saved, the saved cost is kept and `message` starts that note with "Warning:". The status does not change (BR-12).
Dates: the latest allowed date is today in Asia/Karachi (`DATE_TZ`, `DATE_MAX_DAYS_AHEAD` in `app/config.py`); the earliest is 2000-01-01 (`DATE_MIN`).
