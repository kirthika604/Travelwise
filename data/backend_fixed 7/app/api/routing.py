from fastapi import APIRouter, Depends, Request

from app.engines.routing.schemas import (
    RoutingRequest,
    RoutingResponse,
)
from app.engines.routing.service import (
    RoutingService,
)
from app.engines.routing.transit_repository import (
    TransitRepository,
)


router = APIRouter(
    prefix="/routing",
    tags=["Routing Engine"],
)


def get_routing_service(
    request: Request,
) -> RoutingService:

    repository = TransitRepository(
        pool=request.app.state.db_pool
    )

    return RoutingService(
        repository=repository
    )


@router.post(
    "",
    response_model=RoutingResponse,
)
async def find_route(
    payload: RoutingRequest,
    service: RoutingService = Depends(
        get_routing_service
    ),
):
    return await service.route(payload)