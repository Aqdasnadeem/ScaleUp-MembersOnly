import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes_auth import router as auth_router
from .routes_analytics import router as analytics_router
from .routes_anomalies import router as anomalies_router
from .routes_uploads import router as uploads_router

app = FastAPI(title="Scale Up API", version="0.2")          # OpenAPI docs at /docs (FR-API-01)
# The Next.js app runs on another port in development; list the allowed origins in CORS_ORIGINS (comma separated).
app.add_middleware(CORSMiddleware, allow_origins=[o for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o],
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(auth_router)
app.include_router(uploads_router)
app.include_router(analytics_router)
app.include_router(anomalies_router)
