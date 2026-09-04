"""
Cross-cutting hardening for the API: security response headers, a request
body size cap, and structured logging of failures/slow requests. Kept out of
main.py so the route wiring there stays readable.
"""

import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger("travelwise")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Standard defense-in-depth response headers. HSTS is harmless to send
    over plain HTTP (browsers only honor it on HTTPS responses) so it's
    always on here — actual TLS termination happens in front of this
    process (reverse proxy / hosting platform), not in this app."""

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        return response


class MaxBodySizeMiddleware:
    """Rejects requests whose declared Content-Length exceeds the limit
    before any route/Pydantic parsing runs. Every request this API accepts
    is a small structured JSON payload (filters, a handful of place ids) —
    there's no legitimate reason for one to be large.

    Content-Length-based, not a streamed byte-count guard: a request that
    lies about its length via chunked transfer-encoding could still slip a
    larger body past this check. That's an accepted gap here — the intended
    deployment sits behind a reverse proxy / hosting platform that enforces
    its own body-size ceiling on all incoming traffic regardless of this
    header, so this is a second, cheap layer rather than the only one."""

    def __init__(self, app: ASGIApp, max_body_size: int):
        self.app = app
        self.max_body_size = max_body_size

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        content_length = headers.get(b"content-length")
        if content_length is not None:
            try:
                if int(content_length) > self.max_body_size:
                    response = JSONResponse(
                        {"detail": "Request body too large."}, status_code=413
                    )
                    await response(scope, receive, send)
                    return
            except ValueError:
                pass  # malformed header — let downstream parsing reject it

        await self.app(scope, receive, send)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs every 4xx/5xx (auth/validation failures, abuse, bugs) plus
    unusually slow requests, with enough context to spot an attack pattern
    (repeated 4xxs from one IP, a sudden spike) without logging request
    bodies — this API takes no secrets, but there's no reason to keep them
    around in logs regardless."""

    async def dispatch(self, request: Request, call_next):
        start = time.monotonic()
        response = await call_next(request)
        duration_ms = (time.monotonic() - start) * 1000
        client = request.client.host if request.client else "unknown"

        if response.status_code >= 500:
            logger.error(
                "%s %s -> %s (%.0fms) from %s",
                request.method, request.url.path, response.status_code, duration_ms, client,
            )
        elif response.status_code >= 400:
            logger.warning(
                "%s %s -> %s (%.0fms) from %s",
                request.method, request.url.path, response.status_code, duration_ms, client,
            )
        elif duration_ms > 3000:
            logger.warning(
                "%s %s -> %s slow request (%.0fms) from %s",
                request.method, request.url.path, response.status_code, duration_ms, client,
            )

        return response


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
