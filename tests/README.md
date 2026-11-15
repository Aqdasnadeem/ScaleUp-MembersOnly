# Scale Up: schema + ETL test suite

66 automated tests for the database schema (migrations 001-003, 10 tables) and an ETL prototype (`etl.py`) for the four upload types
(sales, inventory, expenses, feedback). Data files the tests create are saved in `data/` so you can open them.

## Run on Windows 11 (PowerShell)

1. Install PostgreSQL 16 (any 14+ works) and Python 3.10+.
2. `pip install psycopg2-binary`
3. In PowerShell, in this folder (use your own password, do not save it in any file):

```powershell
$env:PGHOST = "localhost"
$env:PGPORT = "5432"
$env:PGUSER = "postgres"
$env:PGPASSWORD = Read-Host "postgres password"
python run_tests.py
```

The script creates and drops only two databases: `scaleup_etl_test` and `scaleup_etl_mig`. It never touches others.
Result: console list + `results/report.md`.

## What the result words mean
- **PASS**: behaves as the SRS / business rule says.
- **LIMIT**: a known limitation or by-design behaviour, confirmed and documented (not a bug to fix now).
- **FAIL**: something is wrong. Read the detail text.

## What is covered
| Group | What is checked |
| --- | --- |
| parsers | numbers (Rs, commas, brackets, "12abc", decimal comma), whole numbers, dates (formats, impossible dates, range), text cleaning |
| mapping | auto-suggest of column names; saved mapping per business and file type |
| sales | optional cost_price column (fill-only); 3 different layouts; Excel BOM/CRLF; latin-1; fake .csv (Excel/PDF); empty/header-only; duplicate headers; missing columns; ragged rows; 12 kinds of bad row; SQL-injection text; NUL byte; 19/20/21/100 of 100 bad rows; returns; merging repeated lines; same file twice (skip / replace); replace with a bad file; other business's replace; edited file; tenants; walk-ins; blank SKU; name variants; extra columns; 6 parallel uploads; speed (10k and 100k rows) |
| inventory | snapshots by date; as-of date from upload screen; bad stock values; duplicate product+date; shared products with sales |
| expenses | cleaning; identical rows kept; append / delete edits; refunds; decimal comma |
| feedback | ratings; empty and huge text; duplicates; product link; emoji |
| jobs | bad-row report saved on the job (capped at 1,000); counts and status |
| db | 10 constraint checks in raw SQL + checks for the new columns/table (low_stock_threshold, cost_price, replaced, error_report, column_mappings); known limit: FK does not check business |
| migrations | fresh DB (10 tables), full down (0), full up again |

## Fit test: can the schema take any dataset? (`fit/`)
`fit/fit_test.py` loads very different file shapes through the same ETL, including two public datasets downloaded from GitHub.
Result in `fit/report.md`. Headline: the real UCI Online Retail II file (1,067,371 rows) loaded in 74 s - 999,117 sales lines,
45,299 repeated lines merged, 22,955 rejected (2.15%, almost all returns), 4,984 products and 5,881 customers derived.
Only one tested case needs the database to change: stock in two locations, because the inventory key is product + date.

## Not covered (be honest in the report)
- Real SME files. All data here is made up by the test author.
- Only English text. No Urdu/Unicode-heavy data except emoji.
- `etl.py` is a prototype, not the final worker. Chunked reading of very large files is not implemented (100k rows are read in memory).
- No web/API/auth layer, no agent, no NLP.
- Dates: a wrong business date format (DD/MM vs MM/DD) cannot be detected when all days are 12 or less.

## Files
`etl.py` prototype loader | `run_tests.py` the tests | `migrations/` final SQL (001-003) | `data/` sample CSVs | `results/` last run

## Seed script (P2-07)
After running migrations 001-003 on an EMPTY dev database:
```powershell
$env:PGDATABASE = "scaleup_dev"
# seed data: see db/seed_run_log.txt
```
Creates business `Demo Traders`, login `demo@scaleup.test` (placeholder hash; set `SEED_PASSWORD_HASH` to a real hash if you want to log in), 40 products with cost, ~1,800 sales lines (Aug-Oct 2026), weekly stock snapshots, 33 expenses, 120 reviews.
Planted anomalies: sales spike on 15/09/2026 (about 2.5x a normal day), Electricity jump in October (about 5x), several products at 0 stock in the last snapshot. Files it generates are in `seed/files/`. Do not run twice on the same DB (it creates a second business).

## Known limits (confirmed by tests)
- Edited rows in a re-uploaded file are skipped and reported, not updated.
- cost_price is fill-only: a later file cannot change an existing cost; replacing a job does not undo a cost it filled.
- Wrong business date format (DD/MM vs MM/DD) cannot be detected when all days are 12 or less.
