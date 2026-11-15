# Scale Up: M3 final package (5 Nov 2026, v12)

Nothing here has been pushed or sent. Commit and PR from your own accounts.

## What to hand in, per ticket

| Ticket | Owner (plan) | Hand in | Files here | Evidence |
| --- | --- | --- | --- | --- |
| P2-19 ERD | Alishba | ERD PNG/PDF + source | `docs/ScaleUp_ERD.png`, `.pdf`, `.svg`; source `db/erd_source/` | `db/erd_source/verify.py`: 91 columns (11 tables), 21 foreign keys, 11 primary keys all match the real database |
| P2-06 Schema (migrations) | Alishba | Migration PR | `db/001_create_core_tables.up.sql`, `002_...`, `003_...`, `000_drop_all.down.sql` | `tests/results/report.md`: migrations up, down, up again on a fresh database |
| P2-07 Schema + seed | Aqdas | Migration PR + seed log | The expenses, feedback, column_mappings and rejected_rows tables are already in migrations 001-004; run `psql -d scaleup_dev -f db/seed.sql` for idempotent SQL sample data, or use `py db/seed.py` and `py backend/scripts/load_demo_data.py` for generated CSV uploads | `db/seed_run_log.txt` records API-loader runs; `db/constraint_checks_output.txt` (21 checks) |
| P2-16 SRS v1.0 | Aqdas | PDF in /docs, sent to sir on Fri 6 Nov | `docs/ScaleUp_SRS_v1.0.pdf` (28 pages) | Read the checklist below first |
| Extra | | Data dictionary | `docs/ScaleUp_Data_Dictionary.pdf` | matches the migrations |

P2-06 and P2-07 are split by the plan, but one script makes all eleven tables, so the three migration files are shared. Agree between you which tables each PR names, and which ticket owns the `users` table (P2-08-BE says it adds it, P2-07 says it is a dependency).

## Presentation
- `docs/ScaleUp_Slides_final.pdf`: 12 slides + 1 backup (sir asked for 12 at most).
- `docs/ScaleUp_Slides_speaker_notes.md`: notes for every slide.
- Live deck: the Slides artifact (editable).

## Run the tests (Windows 11, PowerShell): see `RUN_ON_WINDOWS.md` (use `py`, not `python` or `pip`)
This is the OLD prototype suite (66 tests) for the schema and ETL. The backend has its own suite (below).

## Datasets: see `datasets/DATASETS.md`

## Before you send the SRS on Friday
1. Read it once yourselves (28 pages). Section 8.3 lists open questions for sir; OI-6 (inventory per location) and OI-8 (how the worker gets the file) matter for M3/M4.
2. Check that the owners in Appendix A match what you agreed.
3. Check that the proposals are not described as agreed: OI-7 (cost_price, date rule), the "same price and quantity = real repeat" assumption, one location per business.
4. Version table says "1.0 planned, 6 Nov". Change it to "Sent" after you send it.

## Backend, frontend, diagrams, repo setup (all tickets of 5 Nov)
Last run of the whole backend suite: 192 passed, 6 skipped (Linux, PostgreSQL 16). On Windows an earlier version (155 tests) passed; run `py -m pytest tests -q` once on your machine before you upload.

| Ticket | Owner (plan) | Where | Evidence |
| --- | --- | --- | --- |
| P2-08-BE Login API | Humna | `backend/app/routes_auth.py`, `auth.py`, `security.py` | `backend/docs/AUTH_EXAMPLES.md`, `results_test_auth.txt` |
| P2-08-FE Login screen | Chandni | `frontend/` | `frontend/evidence/` (screenshots + `browser_check.txt`) |
| P2-11 Upload API, P2-12 Validation | Humna | `backend/app/routes_uploads.py`, `schemas.py`, `mapping.py` | `docs/API_EXAMPLES.md`, `sample/bad_sales_errors.json`, `results_test_api.txt`, `results_test_validation.txt` |
| P2-13 Cleaning, P2-14 Bulk load | Alishba | `backend/app/cleaning.py`, `transform.py`, `loader.py` | `docs/CLEANING_RULES.md`, `results_test_cleaning.txt`, `results_test_loader.txt` |
| P2-51 Worker | Aqdas | `backend/app/worker.py`, `pipeline.py` | `docs/WORKER_DEMO.md`, `results_test_worker.txt` |
| P2-17 Use case, P2-18 DFD, P2-21 Sequence | Humna | `diagrams/` | `diagrams/README.md` (criteria check) |
| P2-15 Repo setup | Alishba | `repo_setup/` | `repo_setup/P2-15_checklist.md` (script not run yet) |
| Upload history `GET /uploads`, header synonyms (`sku_id`, `current_stock`) | Humna | `list_uploads` in `routes_uploads.py`; `SYNONYMS` in `mapping.py` | `test_history_lists_only_my_jobs...`, `test_sku_id_and_current_stock...` in `results_test_api.txt` |
| Sir's rules of 5 Nov: dates up to today (Asia/Karachi), returns counted apart (outside the 20% rule), cost-difference warning, `file_key`; 6 Nov (sir): no role column, `skipped_rows`, `started_at`, two demo businesses | Humna (API/rules), Alishba (migration 001) | `config.py`, `cleaning.py`, `schemas.py`, `pipeline.py`, `loader.py`; `db/001_create_core_tables.up.sql` (4 new columns); `backend/scripts/create_demo_users.py` (two Business users in two businesses) | `tests/test_returns_cost_role.py` (9), `results_test_returns_cost_role.txt`; ERD and data dictionary updated (91 columns (11 tables)) |
| CSV templates (FR-UP-06), `.gitignore` | Humna | `GET /uploads/template/{type}` in `routes_uploads.py`; `backend/.gitignore` | `test_templates_are_offered_for_all_four_types...` in `results_test_api.txt` |
| API contract (dependency of 7 tickets) | team | `backend/docs/CONTRACT.md`, `backend/docs/openapi.json` | |

PR text for each backend ticket: `backend/docs/PR_TEXTS.md`. How to run everything: `backend/README.md` and the Claude doc "7 Nov demo: connect frontend, backend and database (guide for Aqdas)". Demo data: `backend/scripts/load_demo_data.py`.

## Not in this package (still open for M3)
P2-09 dashboard shell and P2-10 upload screen (Chandni), P2-20 class diagram (Aqdas), P2-22 activity diagram (Humna), running `repo_setup/setup_github.ps1` (Alishba), SRS fixes listed in the audit (EI-01 still says Figma, OI-9 missing, date).
