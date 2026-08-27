import os
from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://kirthika_ck@localhost:5432/chennai",
)

_pool: asyncpg.Pool | None = None


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB pool not initialised — did the app start via lifespan?")
    return _pool


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    # app/api/discovery.py and app/api/routing.py read the pool off
    # request.app.state.db_pool — without this line every /discovery and
    # /routing request 500s with AttributeError: 'State' object has no
    # attribute 'db_pool'.
    app.state.db_pool = _pool
    try:
        yield
    finally:
        await _pool.close()
