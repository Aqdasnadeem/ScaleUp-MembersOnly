# Scale Up: web app

The web app of Scale Up, an AI business assistant for small and medium businesses (upload business CSV files, see dashboards, ask questions in plain language). The API and database are in the backend repo: `<BACKEND_REPO_URL>`.
Final year project, KIET, Fall 2026. Team: Alishba Tariq, Aqdas Nadeem, Chandni Abdullah, Humna Ahmed.

**Clickable mockup (React on Vercel):** `<VERCEL_MOCKUP_URL>`

## Stack
Next.js (App Router), TypeScript, Tailwind CSS, Recharts. Deployed on Vercel.

## How to run (Windows, PowerShell)
```powershell
git clone <FRONTEND_REPO_URL>; cd <repo>
npm install
Copy-Item .env.example .env.local        # then set NEXT_PUBLIC_API_URL (for example http://localhost:8000)
npm run dev                              # http://localhost:3000
```
The backend must be running (see the backend README) and must allow this origin in `CORS_ORIGINS`. `.env.local` is never committed.

## How we work
- `main` is protected: pull requests with one review. Branch names: `feature/P2-xx-short-name`.
- One issue per ticket; the PR that merges last writes `Closes <owner>/<backend-repo>#N`, the other `Refs ...`. Same labels, milestones (M2 to M8) and the same project board as the backend repo.
- Screens must match the mockup layout.
- Commit as yourself; no AI co-author trailers.
