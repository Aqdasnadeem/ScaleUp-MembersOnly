# Scale Up: backend

AI business assistant for small and medium businesses. Users upload sales, inventory, expense and customer-feedback CSV files and ask questions in plain language; an AI agent investigates the data and answers with evidence. This repo is the **backend** (API, background worker, database, AI agent). The web app is in the frontend repo: `<FRONTEND_REPO_URL>`.
Final year project, KIET, Fall 2026. Team: Alishba Tariq, Aqdas Nadeem, Chandni Abdullah, Humna Ahmed.

**Clickable mockup (React on Vercel):** `<VERCEL_MOCKUP_URL>`

## Stack
Python 3.12+ (tested on 3.13 and 3.14), FastAPI, Pydantic v2, PostgreSQL 16 or newer with pgvector, LangGraph and the Gemini API for the agent, Hugging Face / Sentence Transformers for feedback NLP. One codebase, two processes: the API and a background worker. Frontend: Next.js + TypeScript (separate repo).

## How to run (Windows, PowerShell)
```powershell
git clone <BACKEND_REPO_URL>; cd <repo>\backend
py -m pip install -r requirements.txt
# database: create it and apply the migrations in db/ in order (001, 002, 003)
$env:PGHOST="localhost"; $env:PGPORT="5432"; $env:PGUSER="postgres"; $env:PGDATABASE="scaleup_dev"
$env:PGPASSWORD = Read-Host "postgres password"          # never put passwords or keys in files
$env:JWT_SECRET = "<a long random string>"
py -m uvicorn app.main:app --reload                      # API docs: http://localhost:8000/docs
py -m pytest tests -q                                    # tests (they use their own scaleup_backend_test database)
```
Secrets (database password, JWT secret, Gemini key) are environment variables only and are never committed.

## Repository layout
`backend/app` code · `backend/tests` tests · `db/` migrations and seed · `docs/` SRS, diagrams, ERD, data dictionary.

## How we work
- `main` is protected: every change goes through a pull request with one review. Branch names: `feature/P2-xx-short-name`.
- One issue per ticket (`P2-xx`). The PR that merges last writes `Closes <owner>/<repo>#N`; the other PR writes `Refs <owner>/<repo>#N`.
- Labels: feature, backend, frontend, database, ai-ml, diagram, docs, devops, design, test, demo, backlog. Milestones M2 to M8. One project board for both repos: Backlog, To do, In progress, In review, Done.
- Commit as yourself; no AI co-author trailers.
