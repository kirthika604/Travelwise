import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.database import lifespan
from app.middleware import (
    MaxBodySizeMiddleware,
    RequestLoggingMiddleware,
    SecurityHeadersMiddleware,
    configure_logging,
)

from app.api.discovery import router as discovery_router
from app.api.combination import router as combination_router
from app.api.routing import router as routing_router

# These two were written (and documented in README.md) but never actually
# registered below — every /places and /transit endpoint 404'd. They use
# app.database.get_pool() directly rather than the discovery/routing
# engines, so they mount cleanly alongside them with no path conflicts.
from app.routers.places import router as places_router
from app.routers.transit import router as transit_router

configure_logging()

# "production" disables interactive API docs (/docs, /redoc, /openapi.json)
# — nothing in here is secret (it's a public read-only travel API), but an
# open schema/try-it-out console is unnecessary attack surface once this is
# actually deployed. Left on by default for local development.
APP_ENV = os.environ.get("APP_ENV", "development")
_docs_disabled = APP_ENV == "production"

# This is meant to be a public API (no auth — see the rate limit / body
# size / logging middleware below, which are the actual abuse defenses in
# that world) — so it's reachable from any origin by design, not just the
# Next.js frontend's own proxy. allow_credentials stays False regardless
# (nothing here reads or issues cookies), which is what makes a "*" origin
# safe: there's no session/cookie a malicious page could ride on.
#
# Set ALLOWED_ORIGINS (comma-separated) to lock this down to specific
# origins instead, if that ever changes.
_origins_env = os.environ.get("ALLOWED_ORIGINS", "*").strip()
ALLOWED_ORIGINS = ["*"] if _origins_env == "*" else [o.strip() for o in _origins_env.split(",") if o.strip()]

MAX_REQUEST_BODY_BYTES = int(os.environ.get("MAX_REQUEST_BODY_BYTES", 200_000))  # 200 KB
RATE_LIMIT_DEFAULT = os.environ.get("RATE_LIMIT_DEFAULT", "60/minute")

limiter = Limiter(key_func=get_remote_address, default_limits=[RATE_LIMIT_DEFAULT])

app = FastAPI(
    title="TravelWise API",
    description=(
        "Smart travel discovery, place combination "
        "and multimodal routing API"
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if _docs_disabled else "/docs",
    redoc_url=None if _docs_disabled else "/redoc",
    openapi_url=None if _docs_disabled else "/openapi.json",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Order matters: middleware runs outside-in on the request, inside-out on the
# response, so the last one added here is the first to see each request.
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(RequestLoggingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(MaxBodySizeMiddleware, max_body_size=MAX_REQUEST_BODY_BYTES)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    # No endpoint reads cookies or issues them (see lib/supabase.ts — auth
    # lives in the browser's localStorage, never sent to this API), so
    # there's nothing that needs credentialed cross-origin requests.
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

# Register all three engines
app.include_router(discovery_router)
app.include_router(combination_router)
app.include_router(routing_router)

# Register the direct CRUD/lookup endpoints (place detail, nearby-stops,
# stop departures) that the engines above don't cover
app.include_router(places_router)
app.include_router(transit_router)


@app.get("/")
async def root():
    return {
        "message": "TravelWise API is running",
        "engines": [
            "Discovery",
            "Combination",
            "Routing",
        ],
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy"
    }
