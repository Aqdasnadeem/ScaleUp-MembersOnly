import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routes_auth import router as auth_router
from .routes_analytics import router as analytics_router
from .routes_anomalies import router as anomalies_router
from .routes_inventory_alerts import router as inventory_alerts_router
from .routes_inventory_history import router as inventory_history_router
from .routes_admin import router as admin_router
from .billing import router as billing_router
from .routes_uploads import router as uploads_router
from .routes_sales import router as sales_router
from .routes_products import router as products_router
from .routes_expenses import router as expenses_router

app = FastAPI(title="Scale Up API", version="0.2")          # OpenAPI docs at /docs (FR-API-01)
# The Next.js app runs on another port in development; list the allowed origins in CORS_ORIGINS (comma separated).
app.add_middleware(CORSMiddleware, allow_origins=[o for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",") if o],
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(auth_router)
app.include_router(uploads_router)
app.include_router(analytics_router)
app.include_router(anomalies_router)
app.include_router(inventory_alerts_router)
app.include_router(inventory_history_router)
app.include_router(admin_router)
app.include_router(billing_router)
app.include_router(sales_router)          # P2-23: /analytics/sales/kpis, /analytics/sales/trend
app.include_router(products_router)       # P2-24: /analytics/products/ranking
app.include_router(expenses_router)       # P2-27/P2-28: /expenses/categories, /expenses/categories/{category}/entries
