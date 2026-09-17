"""Aegis FastAPI server.

Only ever receives a PayloadV2 — tokens and redacted pixels, never raw page data (AGENTS.md
invariant 1). Request-body logging is intentionally not enabled anywhere in this app.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.api.plan import router as plan_router
from app.config import get_settings

app = FastAPI(title="Aegis Server", version=get_settings().version)

settings = get_settings()
if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )

app.include_router(health_router)
app.include_router(plan_router)
