from fastapi import APIRouter, Depends, Request

from app.engines.discovery.repository import DiscoveryRepository
from app.engines.discovery.schemas import (
    DiscoveryRequest,
    DiscoveryResponse,
)
from app.engines.discovery.service import DiscoveryService


router = APIRouter(
    prefix="/discovery",
    tags=["Discovery Engine"],
)


def get_discovery_service(
    request: Request,
) -> DiscoveryService:

    repository = DiscoveryRepository(
        pool=request.app.state.db_pool
    )

    return DiscoveryService(repository)


@router.post(
    "",
    response_model=DiscoveryResponse,
)
async def discover_places(
    payload: DiscoveryRequest,
    service: DiscoveryService = Depends(
        get_discovery_service
    ),
):
    return await service.discover(payload)