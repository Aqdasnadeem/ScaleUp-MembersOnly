# Run both tests on Windows 11 (PowerShell)

Needs: PostgreSQL 16 (14+ works) running locally, Python 3.10+.

## 0. One-time setup
```powershell
cd <unzipped folder>\tests
py -m pip install psycopg2-binary
$env:PGHOST = "localhost"
$env:PGPORT = "5432"
$env:PGUSER = "postgres"
$env:PGPASSWORD = Read-Host "postgres password"     # typed here, not saved in any file
```
Keep the same PowerShell window open for both tests (the variables live only in that window).

## 1. Test suite (66 tests, about 1 minute)
```powershell
py run_tests.py
```
Expected last line: `66 tests: 63 PASS, 3 known-limit confirmed, 0 FAIL`. Full list is in `results\report.md`.
Creates and drops only `scaleup_etl_test` and `scaleup_etl_mig`.

## 2. Fit test on real datasets (about 4 to 5 minutes on a laptop (224 s on an 8 GB machine), about 1 GB free RAM, 100 MB download)
```powershell
mkdir realsets
curl.exe -L -o realsets\online_retail_II.csv https://raw.githubusercontent.com/omidreza-amrollahi/online_retail_data/main/online_retail_II.csv
curl.exe -L -o realsets\superstore.csv       https://raw.githubusercontent.com/muskaanpirani/Analysis_of_retail_store/main/SampleSuperstore.csv
curl.exe -L -o realsets\stock_codes.csv      https://raw.githubusercontent.com/omidreza-amrollahi/online_retail_data/main/stock_codes.csv
cd fit
py fit_test.py
```
It prints a summary at the end. Compare with `fit\report.md` (my run): Online Retail II should show loaded 999117, rejected 22955.
Creates and drops only `scaleup_fit`. The big file took 74 s on my test server and 224 s on an 8 GB laptop.
