"""
Refresh Itinerary Schemas.

Allows users to re-check transit availability for a saved itinerary
at a different departure time. Returns the updated itinerary with
a summary of what changed (transit status, timing, fares).
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class RefreshRequest(BaseModel):
    """
    Request to refresh an itinerary at a different time.

    The user provides:
    1. The original places (same order as the saved itinerary)
    2. A new departure_time
    3. Optional: new start_location (if user moved)
    4. Optional: updated transit preferences
    """

    places: list[dict] = Field(
        description=(
            "Original places from the saved itinerary. "
            "Each dict should have: id, name, latitude, longitude, "
            "time_needed_min_hr, final_score, best_time_of_day"
        ),
    )

    new_departure_time: datetime = Field(
        description="New departure time to re-check transit availability",
    )

    available_hours: float = Field(
        gt=0,
        description="Total hours available for the trip",
    )

    start_location: Optional[dict] = Field(
        default=None,
        description="Updated user location (if different from original)",
    )

    # ── Transit preferences ──
    max_walking_distance_km: float = Field(
        default=1.0,
        gt=0,
        le=5.0,
        description="Max walk to/from transit stops",
    )

    max_transfers_per_leg: int = Field(
        default=2,
        ge=0,
        le=4,
        description="Max transfers for each leg between places",
    )

    fallback_walk_speed_kmph: float = Field(
        default=5.0,
        gt=0,
        description="Walking speed if no transit available",
    )


class LegChange(BaseModel):
    """
    Describes what changed for a specific leg after refresh.
    """

    leg_index: int = Field(
        description="Index of the leg in the itinerary",
    )

    from_place: str
    to_place: str

    # ── Original values ──
    original_mode: str = Field(
        description="Original transport mode (e.g., 'Walk+Bus+Walk')",
    )
    original_mode_label: str = Field(
        default="",
        description="Original friendly label (e.g., 'MTC Bus 51C')",
    )
    original_transit_available: bool
    original_duration_minutes: float
    original_depart_time: Optional[datetime] = None
    original_arrive_time: Optional[datetime] = None

    # ── New values ──
    new_mode: str = Field(
        description="New transport mode (e.g., 'Walk+Metro+Walk')",
    )
    new_mode_label: str = Field(
        default="",
        description="New friendly label (e.g., 'CMRL Metro Blue Line')",
    )
    new_transit_available: bool
    new_duration_minutes: float
    new_depart_time: Optional[datetime] = None
    new_arrive_time: Optional[datetime] = None

    # ── Change summary ──
    change_type: str = Field(
        description=(
            "Type of change: 'no_change', 'time_shift', 'mode_changed', "
            "'transit_lost', 'transit_gained', 'duration_changed', 'fare_changed'"
        ),
    )

    change_summary: str = Field(
        description="Human-readable summary: 'Bus 51C replaced by Metro Blue Line'",
    )

    duration_delta_minutes: float = Field(
        default=0.0,
        description="Change in duration (positive = longer, negative = shorter)",
    )

    fare_delta: float = Field(
        default=0.0,
        description="Change in fare (positive = more expensive)",
    )


class RefreshedItinerary(BaseModel):
    """
    The refreshed itinerary with updated timing and transit details.
    """

    # ── Places (same as original, but with new timing) ──
    places: list[dict] = Field(
        description="Places with updated arrival/departure times",
    )

    # ── Updated legs ──
    legs: list[dict] = Field(
        description="Updated transit legs with new departure/arrival times",
    )

    # ── Timing ──
    start_time: datetime
    end_time: datetime
    total_time_hr: float

    total_visit_time_hr: float
    total_travel_time_hr: float
    total_walking_time_hr: float = 0.0
    total_transit_time_hr: float = 0.0
    total_wait_time_hr: float = 0.0

    # ── Quality ──
    average_place_score: float

    # ── Feasibility ──
    all_legs_have_transit: bool = False
    transit_availability_summary: str = ""

    # ── Fare summary ──
    total_fare: float = 0.0
    fare_breakdown: dict = Field(default_factory=dict)
    fare_notes: list[str] = Field(default_factory=list)


class RefreshResponse(BaseModel):
    """
    Response from the refresh endpoint.
    Contains the updated itinerary and a summary of changes.
    """

    # ── Status ──
    success: bool = Field(
        description="True if the itinerary was successfully refreshed",
    )

    message: str = Field(
        description="Status message: 'Itinerary refreshed', 'No transit available', etc.",
    )

    # ── Original itinerary (for comparison) ──
    original_departure_time: datetime = Field(
        description="The original departure time",
    )

    new_departure_time: datetime = Field(
        description="The new departure time",
    )

    # ── Changes summary ──
    total_changes: int = Field(
        default=0,
        description="Number of legs that changed",
    )

    legs_with_transit_now: int = Field(
        default=0,
        description="Number of legs that have transit after refresh",
    )

    legs_lost_transit: int = Field(
        default=0,
        description="Number of legs that lost transit availability",
    )

    legs_gained_transit: int = Field(
        default=0,
        description="Number of legs that gained transit availability",
    )

    # ── Per-leg changes ──
    leg_changes: list[LegChange] = Field(
        default_factory=list,
        description="Detailed changes for each leg",
    )

    # ── Updated itinerary ──
    itinerary: Optional[RefreshedItinerary] = Field(
        default=None,
        description="The refreshed itinerary with new timing and transit details",
    )

    # ── Summary ──
    summary: str = Field(
        description=(
            "Human-readable summary: "
            "'2/3 legs changed: Bus→Metro on leg 1, walking only on leg 2'"
        ),
    )
