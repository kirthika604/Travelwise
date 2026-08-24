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
    try:
        yield
    finally:
        await _pool.close()
