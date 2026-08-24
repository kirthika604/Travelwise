from fastapi import FastAPI

from .database import lifespan, get_pool
from .routers import places, transit

app = FastAPI(
    title="Chennai Explore API",
    description=(
        "Places to explore (POIs + food spots) with user constraints, "
        "and the multi-modal transit data (bus/metro/suburban train) "
        "needed to route to them."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(places.router)
app.include_router(transit.router)


@app.get("/health")
async def health():
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.fetchval("SELECT 1")
    return {"status": "ok"}
