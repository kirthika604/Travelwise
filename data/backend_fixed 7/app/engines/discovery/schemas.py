from typing import Optional

from pydantic import BaseModel, Field


class DiscoveryRequest(BaseModel):
    # User interests/categories/vibes/cuisines
    interests: list[str] = Field(default_factory=list)

    # Low, Medium, High
    budget: Optional[str] = None

    # Total time the user has for exploring
    available_hours: Optional[float] = Field(
        default=None,
        gt=0
    )

    # User location
    latitude: Optional[float] = Field(
        default=None,
        ge=-90,
        le=90
    )

    longitude: Optional[float] = Field(
        default=None,
        ge=-180,
        le=180
    )

    # Maximum distance from user
    radius_km: Optional[float] = Field(
        default=None,
        gt=0
    )

    # Morning, Afternoon, Evening, Night, etc.
    preferred_time: Optional[str] = None

    # Optional source filter: poi or food
    source: Optional[str] = None

    # Number of results
    limit: int = Field(
        default=20,
        ge=1,
        le=100
    )


class PlaceResult(BaseModel):
    id: int
    name: str
    source: str
    description: Optional[str] = None
    category: str

    budget_level: Optional[str] = None

    entry_fee_min: Optional[float] = None
    entry_fee_max: Optional[float] = None

    avg_expense_min: Optional[float] = None
    avg_expense_max: Optional[float] = None

    time_needed_min_hr: Optional[float] = None
    time_needed_max_hr: Optional[float] = None

    best_time_of_day: list[str] = Field(default_factory=list)

    rating: Optional[float] = None

    image_url: Optional[str] = None
    location_url: Optional[str] = None

    latitude: float
    longitude: float

    distance_km: Optional[float] = None

    interest_score: float
    budget_score: float
    time_score: float
    distance_score: float
    rating_score: float

    final_score: float

    tags: list[str] = Field(default_factory=list)
    cuisines: list[str] = Field(default_factory=list)


class DiscoveryResponse(BaseModel):
    total_results: int
    places: list[PlaceResult]