"""
Refresh Itinerary API Endpoint.

Re-checks transit availability for a saved itinerary at a different time.
Returns the updated itinerary with a summary of what changed.
"""

from fastapi import APIRouter, Depends, Request

from .refresh_schemas import (
    RefreshRequest,
    RefreshResponse,
)
from .refresh_service import RefreshService
from ..engines.routing.transit_repository import TransitRepository


router = APIRouter(
    prefix="/refresh",
    tags=["Refresh Itinerary"],
)


def get_refresh_service(
    request: Request,
) -> RefreshService:
    """
    Create RefreshService with TransitRepository.
    """
    repository = TransitRepository(
        pool=request.app.state.db_pool,
    )
    return RefreshService(repository=repository)


@router.post(
    "",
    response_model=RefreshResponse,
)
async def refresh_itinerary(
    payload: RefreshRequest,
    service: RefreshService = Depends(
        get_refresh_service
    ),
):
    """
    Refresh an itinerary at a different departure time.

    This endpoint re-checks transit availability for a saved itinerary
    at a new time. It returns:
    - The updated itinerary with new timing
    - A summary of what changed (transit status, mode changes, timing)
    - Per-leg changes with before/after comparison

    Use cases:
    - User wants to leave later/earlier
    - User wants to check if metro is available instead of bus
    - User wants to see if walking is still feasible

    Example request:
    ```json
    {
      "places": [
        {"id": 1, "name": "Marina Beach", "latitude": 13.05, "longitude": 80.28,
         "time_needed_min_hr": 1.5, "final_score": 0.85, "best_time_of_day": ["Morning"]},
        {"id": 2, "name": "Kapaleeshwarar Temple", "latitude": 13.03, "longitude": 80.27,
         "time_needed_min_hr": 1.0, "final_score": 0.82, "best_time_of_day": ["Morning"]}
      ],
      "new_departure_time": "2024-01-15T14:00:00",
      "available_hours": 4,
      "start_location": {"latitude": 13.08, "longitude": 80.21}
    }
    ```
    """
    return await service.refresh(payload)
