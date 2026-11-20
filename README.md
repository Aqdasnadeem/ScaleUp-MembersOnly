# Scale Up: team setup guide

Maintainer: Humna Ahmed <humnaahmed544@gmail.com>

## 1. What this is

Scale Up is a local business analytics app with a FastAPI backend, a background upload worker, a Next.js frontend, and PostgreSQL. M2 covers signup/login, CSV upload, validation, cleaning, database loading, and worker retries. M3 adds sales KPIs and product ranking (P2-23/P2-24), inventory alerts and history (P2-25/P2-26), expense analysis and unusual-increase flags (P2-27/P2-28), and persisted anomaly detection (P2-29). M4 adds super-admin pages, Free/Pro plans and billing, loaders and disabled-button behavior, synthetic demo data, and the upload/button fixes.

## 2. Prerequisites

- Windows PowerShell
- Python 3.14.0 (`py --version`)
- Node.js v24.18.0 (`node -v`)
- PostgreSQL 18.4 (`psql --version`)
- pgvector is not used by the running application; no extension is required.

Install dependencies from the repository root:

```powershell
py -m pip install -r .\backend\requirements.txt
Push-Location .\frontend
npm install
Pop-Location
```

## 3. One-time setup

1. Connect to PostgreSQL and set a password you choose:

   ```powershell
   psql -h localhost -U postgres -d postgres
   ```

   At the `psql` prompt, run `\password postgres`, enter the password twice, then run `\q`.

2. Create the development database with UTF-8 encoding:

   ```powershell
   createdb -h localhost -U postgres --encoding=UTF8 --template=template0 scaleup_dev
   ```

3. Generate a per-user JWT secret. It is stored in your Windows user environment, not in this repository:

   ```powershell
   .\setup-jwt-once.ps1
   ```

   Open a new PowerShell window after this step.

## 4. Database migrations

Run these six **up** migrations in this order, once, against `scaleup_dev`:

1. `001_create_core_tables.up.sql`
2. `002_create_data_tables.up.sql`
3. `003_create_indexes.up.sql`
4. `004_create_indexes_rest.up.sql`
5. `005_admin_and_plans.up.sql`
6. `006_create_anomalies.up.sql`

From the repository root, apply them in one `psql` session:

```powershell
psql -h localhost -U postgres -d scaleup_dev -v ON_ERROR_STOP=1 -f .\db\001_create_core_tables.up.sql -f .\db\002_create_data_tables.up.sql -f .\db\003_create_indexes.up.sql -f .\db\004_create_indexes_rest.up.sql -f .\db\005_admin_and_plans.up.sql -f .\db\006_create_anomalies.up.sql
```

The `.down.sql` files are rollback scripts; do not run them for setup. The local source set has no SQL seed. The base repository has an older seed file with protected demo-account data; this setup does not use or execute it. Sign up for a business account in the app; create a super-admin as described below.

## 5. Run the app

For manual frontend startup, copy the example URL into the local-only environment file:

```powershell
Copy-Item .\frontend\.env.example .\frontend\.env.local
```

Run the launcher from the repository root:

```powershell
.\start-dev.ps1
```

It asks for the PostgreSQL password once and opens three PowerShell windows:

1. API: `http://localhost:8001` (`http://localhost:8001/docs`)
2. Worker: polls for upload jobs and runs anomaly detection after successful loads
3. Frontend: `http://localhost:3000`

The launcher uses paths relative to its own location. To start components manually, use `py -m uvicorn app.main:app --port 8001 --reload` and `py -m app.worker` from `backend`, and `npm run dev` from `frontend`.

## 6. Synthetic test data

The CSVs in `backend\sample\demo\` are **synthetic**, fixed-seed demo data, not real business records. Upload one file at a time in this order:

1. `demo_sales.csv` (Sales)
2. `demo_inventory.csv` (Inventory)
3. `demo_expenses.csv` (Expenses)

The planted sales spike/drop, Marketing expense increase, and inventory drop are documented in `backend\sample\demo\demo_planted_anomalies.md`. Three uploads stay within the Free plan's monthly allowance.

## 7. Tests and checks

Run the backend tests from `backend`:

```powershell
py -m pytest -q -p no:cacheprovider
```

Verified result on this branch: **318 passed, 6 skipped, 0 failed**. The test fixture rebuilds only `scaleup_backend_test`; do not store personal data in that database.
The parity tests use the root `tests/` fixtures already present on the team repository; keep that inherited folder in place.

Run frontend checks from `frontend`:

```powershell
npm run test
npx tsc --noEmit
npm run lint
npm run build
```

Verified results: 41 frontend tests (37 passed, 4 skipped, 0 failed); TypeScript, lint, and production build all passed. The four skipped tests require `TEST_DATABASE_URL`.

## 8. Accounts

New business users sign up at `/signup`; signup does not grant administrator privileges. Super-admins are created only by the backend bootstrap script, not by signup. The script reads `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` from the process environment and never accepts them as command-line arguments. With PostgreSQL connection variables (`PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE`, and `PGPASSWORD`) set in the same shell, create a new admin using values you choose:

```powershell
$pgSecret = Read-Host "Postgres password" -AsSecureString
$env:PGHOST = "localhost"
$env:PGPORT = "5432"
$env:PGUSER = "postgres"
$env:PGDATABASE = "scaleup_dev"
$env:PGPASSWORD = [System.Net.NetworkCredential]::new("", $pgSecret).Password
$env:SUPERADMIN_EMAIL = Read-Host "Super-admin email"
$secret = Read-Host "Super-admin password" -AsSecureString
$env:SUPERADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $secret).Password
Push-Location .\backend
py -m app.scripts.create_superadmin
Pop-Location
Remove-Item Env:PGPASSWORD, Env:SUPERADMIN_PASSWORD
```

The script is idempotent for that email. Keep the chosen credentials out of source files and commit history.

## 9. Known limitations

- The PKR 1,000 minimum increase for expense anomaly flags is a **proposal pending advisor confirmation**.
- Returns are counted in upload results but are not stored as separate rows.
- The Free plan allows 5 uploads per month. Pro billing is a mock checkout for the demo; no real payment is processed.
- Default local ports are PostgreSQL 5432, API 8001, and frontend 3000.
- The frontend development-dependency audit reports 42 dev-only advisories. They are not runtime application dependencies.

## 10. Ticket map

| Ticket | Main files | Focused tests |
|---|---|---|
| P2-08 signup/login | `backend/app/routes_auth.py`, `frontend/src/components/auth/AuthForm.tsx` | `backend/tests/test_auth.py` |
| P2-11 upload API | `backend/app/routes_uploads.py`, `frontend/src/app/upload/page.tsx` | `backend/tests/test_api.py` |
| P2-12 validation and mappings | `backend/app/schemas.py`, `backend/app/mapping.py` | `backend/tests/test_validation.py` |
| P2-13 cleaning and transformation | `backend/app/cleaning.py`, `backend/app/transform.py` | `backend/tests/test_cleaning.py` |
| P2-14 bulk load | `backend/app/loader.py` | `backend/tests/test_loader.py` |
| P2-51 background worker | `backend/app/worker.py`, `backend/app/pipeline.py` | `backend/tests/test_worker.py` |
| P2-23 sales KPIs | `backend/app/routes_sales.py`, `frontend/src/components/SalesAnalyticsDashboard.tsx`, `frontend/src/lib/api.ts` | `backend/tests/test_sales_kpis.py` |
| P2-24 product ranking | `backend/app/routes_products.py`, `frontend/src/components/ProductRankingTable.tsx`, `frontend/src/lib/product-ranking.ts` | `backend/tests/test_product_ranking.py`, `frontend/src/lib/server/product-ranking.test.ts` |
| P2-25 low stock | `backend/app/routes_inventory_alerts.py`, `frontend/src/components/LowStockAlerts.tsx` | `backend/tests/test_low_stock_api.py` |
| P2-26 inventory history | `backend/app/routes_inventory_history.py`, `frontend/src/components/InventoryHistoryChart.tsx`, `frontend/src/components/InventoryProductDetails.tsx` | `backend/tests/test_inventory_history_api.py` |
| P2-27/P2-28 expenses and flags | `backend/app/routes_analytics.py`, `backend/app/routes_expenses.py`, `backend/app/expense_flags.py`, `frontend/src/components/ExpensesAnalytics.tsx` | `backend/tests/test_expense_analytics.py`, `backend/tests/test_expenses_api.py`, `frontend/src/lib/server/expenses.test.ts` |
| P2-29 anomalies | `backend/app/anomalies.py`, `backend/app/routes_anomalies.py`, `frontend/src/components/AnomaliesList.tsx` | `backend/tests/test_anomalies.py`, `frontend/src/lib/server/anomalies.test.ts` |
| M4 super-admin and plans | `backend/app/routes_admin.py`, `backend/app/billing.py`, `backend/app/scripts/create_superadmin.py`, `frontend/src/app/admin/`, `frontend/src/app/billing/` | `backend/tests/test_admin.py`, `backend/tests/test_plans.py` |
| M4 loaders, buttons, upload fixes | `frontend/src/components/Button.tsx`, `frontend/src/hooks/useAsyncAction.ts`, `frontend/src/app/upload/page.tsx`, `frontend/src/components/UploadResultCard.tsx` | `frontend/src/hooks/asyncActionGuard.test.ts` |
| M4 demo data | `backend/scripts/generate_demo_data.py`, `backend/sample/demo/` | `backend/tests/test_anomalies.py` |
