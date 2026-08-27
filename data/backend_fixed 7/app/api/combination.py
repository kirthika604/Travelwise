from fastapi import APIRouter, Depends, Request

from app.engines.combination.schemas import (
    CombinationRequest,
    CombinationResponse,
)
from app.engines.combination.service import (
    CombinationService,
)
from app.engines.routing.transit_repository import TransitRepository
from app.engines.discovery.repository import DiscoveryRepository


router = APIRouter(
    prefix="/combination",
    tags=["Combination Engine"],
)


def get_combination_service(
    request: Request,
) -> CombinationService:
    """
    Create CombinationService with TransitRepository for real transit
    availability checking, and a DiscoveryRepository so it can top up a
    plan with a nearby food place when the user's picks don't include one.
    """
    repository = TransitRepository(
        pool=request.app.state.db_pool,
    )
    discovery_repository = DiscoveryRepository(
        pool=request.app.state.db_pool,
    )
    return CombinationService(repository, discovery_repository)


@router.post(
    "",
    response_model=CombinationResponse,
)
async def create_combinations(
    payload: CombinationRequest,
    service: CombinationService = Depends(
        get_combination_service
    ),
):
    """
    Create itineraries using real transit availability.

    Instead of estimating travel time at 25 km/h, this endpoint:
    1. Checks if bus/train/metro is actually available at that time
    2. Uses real departure/arrival times from GTFS schedules
    3. Falls back to walking if no transit is available
    4. Returns detailed transit information for each leg
    """
    return await service.combine(payload)
