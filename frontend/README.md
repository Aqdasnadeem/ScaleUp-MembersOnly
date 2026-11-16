# Scale Up

Scale Up is a student business analytics frontend for uploading sales, inventory, expenses, and customer-review CSVs to its FastAPI service.

## Run locally

Requirements: Node.js 20.9 or later and the FastAPI service reachable at `http://localhost:8000`.

1. Install dependencies:
   ```powershell
   npm.cmd install
   ```
2. Set `NEXT_PUBLIC_API_URL` in `.env.local` to the FastAPI origin. For local development, use `http://localhost:8000`.
3. Start the website:
   ```powershell
   npm.cmd run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000).

Sign-up, sign-in, business lookup, CSV preview/upload, templates, upload history, and authenticated dashboard sales analytics call FastAPI directly. The dashboard's gross revenue, distinct orders, average order value, and daily/monthly trend come from `GET /analytics/sales` and can be filtered by inclusive dates. Public `/demo` pages use sample data and are separate from authenticated application pages. Password recovery is not part of the current FastAPI contract.

## Checks

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

`npm run lint` checks application, script, and video source files. Tests cover password rules, date/profile validation, CSV validation, password hashing, and the four assistant question handlers.

The database-backed signup/sign-in/logout, row-level isolation, reset-token, and profile-persistence tests run when `TEST_DATABASE_URL` points to a dedicated disposable database with migrations applied. Otherwise they are skipped. To migrate the test database in PowerShell, temporarily set `$env:DATABASE_URL = $env:TEST_DATABASE_URL`, run `npm.cmd run db:migrate`, then run `npm.cmd test`. Do not point it at production data.

## Walkthrough video

The Remotion source is in `video/`. Render the 40-second, 1920x1080, 30 fps walkthrough and its player assets with:

```powershell
npm.cmd run video:render
```

The command writes an MP4, a WebM, and a poster to `public/video/`. Captions are maintained separately in `public/video/walkthrough.en.vtt`; the video has no audio. The first render may download Remotion's Chromium renderer.

## Feature status

- **Implemented:** FastAPI sign-up/sign-in, token-protected application pages, CSV preview/mapping/upload, upload-job polling, upload history, and live sales KPIs/trends on the dashboard.
- **Demo:** public sample data and sample assistant pages.
- **Planned:** downloadable PDF reports and a standalone forecasting page.

History lists upload jobs from FastAPI. Password recovery is not available in the current FastAPI contract.
