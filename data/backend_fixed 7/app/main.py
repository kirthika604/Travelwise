from fastapi import FastAPI

from app.database import lifespan

from app.api.discovery import router as discovery_router
from app.api.combination import router as combination_router
from app.api.routing import router as routing_router

# These two were written (and documented in README.md) but never actually
# registered below — every /places and /transit endpoint 404'd. They use
# app.database.get_pool() directly rather than the discovery/routing
# engines, so they mount cleanly alongside them with no path conflicts.
from app.routers.places import router as places_router
from app.routers.transit import router as transit_router


app = FastAPI(
    title="TravelWise API",
    description=(
        "Smart travel discovery, place combination "
        "and multimodal routing API"
    ),
    version="1.0.0",
    lifespan=lifespan,
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