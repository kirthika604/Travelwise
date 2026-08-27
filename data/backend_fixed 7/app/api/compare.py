"""
Compare Itineraries API Endpoint.

Provides side-by-side comparison of multiple itineraries showing:
- Timing breakdown
- Transit availability per leg
- Place availability checks
- Recommendation with reasoning
"""

from fastapi import APIRouter

from .compare_schemas import (
    CompareRequest,
    CompareResponse,
)
from .compare_service import ComparisonService


router = APIRouter(
    prefix="/compare",
    tags=["Compare Itineraries"],
)


@router.post(
    "",
    response_model=CompareResponse,
)
async def compare_itineraries(
    payload: CompareRequest,
):
    """
    Compare multiple itineraries side-by-side.

    Use this endpoint after generating itineraries with /combination
    to get a detailed comparison showing:
    - Which itinerary is fastest
    - Which has better transit availability
    - Time spent walking vs. on transit
    - Whether places are open when you'd arrive
    - Recommendation with reasoning

    **Example use case:**
    1. Call `/combination` with your places and constraints
    2. Take 2-3 of the resulting itineraries
    3. POST them to `/compare` to see which is best
    """

    service = ComparisonService()
    return service.compare(payload)
