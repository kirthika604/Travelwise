from .multimodal_router import MultiModalRouter
from .schemas import (
    RoutingRequest,
    RoutingResponse,
)
from .transit_repository import TransitRepository


class RoutingService:
    """
    Routing service using multi-modal router with preference-based ranking.

    Supports:
      - Multi-modal routes (walk → bus → metro → train → walk)
      - Time-based availability (weekday/weekend filtering)
      - Frequency-based services (metro headway calculation)
      - User preferences (prefer_fewer_transfers, prefer_less_walking, etc.)
    """

    def __init__(self, repository: TransitRepository):
        self.repository = repository
        self.router = MultiModalRouter(repository)

    async def route(self, request: RoutingRequest) -> RoutingResponse:
        """
        Find all possible multi-modal routes from origin to destination.
        Routes are ranked based on user preferences.
        """
        return await self.router.find_all_routes(request)
