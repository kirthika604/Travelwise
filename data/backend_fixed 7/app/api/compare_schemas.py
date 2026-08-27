"""
Schemas for the Compare Itineraries endpoint.

Provides a side-by-side comparison of multiple itineraries showing:
- Timing breakdown (visit, travel, walk, transit, wait)
- Transit availability per leg
- Place-by-place comparison
- Overall feasibility score
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ──────────────────────────────────────────────────────
# Request
# ──────────────────────────────────────────────────────

class ItineraryToCompare(BaseModel):
    """
    An itinerary to include in the comparison.
    Can be passed directly or by ID (if saved).
    """

    itinerary_id: Optional[str] = Field(
        default=None,
        description="ID of a previously saved itinerary (if applicable)",
    )

    # OR pass the full itinerary data inline
    places: list[dict] = Field(
        default_factory=list,
        description="List of places in this itinerary (inline mode)",
    )

    legs: list[dict] = Field(
        default_factory=list,
        description="Transit legs between places (inline mode)",
    )

    departure_time: datetime
    total_time_hr: float
    total_visit_time_hr: float
    total_travel_time_hr: float
    total_walking_time_hr: float = 0.0
    total_transit_time_hr: float = 0.0
    total_wait_time_hr: float = 0.0
    average_place_score: float = 0.0
    all_legs_have_transit: bool = False
    transit_availability_summary: str = ""


class CompareRequest(BaseModel):
    """
    Request to compare multiple itineraries side-by-side.
    """

    itineraries: list[ItineraryToCompare] = Field(
        min_length=2,
        max_length=10,
        description="Itineraries to compare (2-10)",
    )

    # Optional comparison preferences
    prioritize: str = Field(
        default="balanced",
        description="What to highlight: 'speed', 'transit', 'walking', 'balanced'",
    )


# ──────────────────────────────────────────────────────
# Response
# ──────────────────────────────────────────────────────

class LegComparison(BaseModel):
    """Comparison of a single leg across itineraries."""

    leg_index: int = Field(
        description="Which leg in the journey (0 = first leg)",
    )

    from_place: str
    to_place: str

    # Per-itinerary values
    travel_minutes: list[float] = Field(
        description="Travel time in minutes for each itinerary",
    )
    modes: list[str] = Field(
        description="Transport mode for each itinerary",
    )
    transit_available: list[bool] = Field(
        description="Whether transit was available for each itinerary",
    )
    route_names: list[Optional[str]] = Field(
        description="Route name for each itinerary (null if walking)",
    )
    fares: list[float] = Field(
        default_factory=list,
        description="Fare in INR for each itinerary",
    )

    # Best option highlighting
    fastest_index: int = Field(
        default=-1,
        description="Index of the fastest option (-1 if tied)",
    )
    has_transit_index: int = Field(
        default=-1,
        description="Index of the option with transit (-1 if none)",
    )
    cheapest_index: int = Field(
        default=-1,
        description="Index of the cheapest option (-1 if tied)",
    )


class PlaceAvailability(BaseModel):
    """Check if a place is open when you'd arrive."""

    place_name: str
    best_time_of_day: list[str]

    # Per-itinerary arrival times
    arrival_times: list[Optional[datetime]] = Field(
        description="When you arrive at this place in each itinerary",
    )

    # Coarse availability check
    arrival_fits_best_time: list[Optional[bool]] = Field(
        description="Whether arrival time fits the place's best_time_of_day",
    )


class TimingBreakdown(BaseModel):
    """Timing breakdown for a single itinerary."""

    itinerary_label: str  # "Itinerary 1", "Itinerary 2", etc.

    total_hours: float
    visit_hours: float
    travel_hours: float
    walking_hours: float
    transit_hours: float
    wait_hours: float

    # Percentages
    visit_pct: float = Field(description="% of time spent visiting places")
    travel_pct: float = Field(description="% of time spent traveling")
    transit_pct: float = Field(description="% of time on public transport")
    walking_pct: float = Field(description="% of time walking")

    # Fare
    total_fare: float = Field(
        default=0.0,
        description="Total fare in INR",
    )
    fare_per_hour: float = Field(
        default=0.0,
        description="Cost per hour of travel in INR",
    )


class TransitSummary(BaseModel):
    """Transit availability summary for one itinerary."""

    itinerary_label: str

    total_legs: int
    legs_with_transit: int
    transit_coverage_pct: float  # 0-100

    modes_used: list[str]
    total_transfers: int

    # Best/worst leg
    fastest_leg_minutes: Optional[float] = None
    slowest_leg_minutes: Optional[float] = None

    # Fare summary
    total_fare: float = Field(
        default=0.0,
        description="Total fare in INR",
    )
    fare_by_mode: dict = Field(
        default_factory=dict,
        description="Fare breakdown by mode: {bus: 15, metro: 30}",
    )


class ComparisonVerdict(BaseModel):
    """AI-generated verdict on which itinerary is best."""

    winner_index: int = Field(
        description="Index of the recommended itinerary (-1 if no clear winner)",
    )
    reason: str = Field(
        description="Why this itinerary is recommended",
    )
    trade_offs: list[str] = Field(
        default_factory=list,
        description="Trade-offs to consider",
    )


class CompareResponse(BaseModel):
    """
    Side-by-side comparison of itineraries.
    """

    # ── Overview ──
    total_itineraries: int

    # ── Per-itinerary timing ──
    timing: list[TimingBreakdown]

    # ── Leg-by-leg comparison ──
    leg_comparison: list[LegComparison] = Field(
        description="Compare each leg across itineraries",
    )

    # ── Transit summaries ──
    transit_summaries: list[TransitSummary]

    # ── Place availability ──
    place_availability: list[PlaceAvailability] = Field(
        default_factory=list,
        description="Check if places are open when you'd arrive",
    )

    # ── Recommendation ──
    verdict: ComparisonVerdict

    # ── Quick comparison table (for UI) ──
    comparison_matrix: dict = Field(
        default_factory=dict,
        description="Matrix for quick UI rendering: {metric: [val1, val2, ...]}",
    )

    # ── Fare comparison ──
    cheapest_index: int = Field(
        default=-1,
        description="Index of the cheapest itinerary",
    )
    most_expensive_index: int = Field(
        default=-1,
        description="Index of the most expensive itinerary",
    )
    fare_savings: float = Field(
        default=0.0,
        description="Savings from cheapest to most expensive in INR",
    )
