from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class Location(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class PlaceInput(BaseModel):
    id: int
    name: str

    latitude: float
    longitude: float

    time_needed_min_hr: Optional[float] = Field(
        default=None,
        ge=0,
    )

    time_needed_max_hr: Optional[float] = Field(
        default=None,
        ge=0,
    )

    final_score: float = Field(
        ge=0,
        le=1,
    )

    # ── Opening time approximation ──
    best_time_of_day: list[str] = Field(
        default_factory=list,
        description="Coarse time hints from source data (Morning, Afternoon, Evening)",
    )

    # 'poi' or 'food' — lets the combination engine tell whether a plan
    # already includes a place to eat, so it knows when to top one up.
    source: str = Field(
        default="poi",
        description="'poi' or 'food'",
    )


class RouteStepDetail(BaseModel):
    """
    Detailed step in a transit leg.
    Each step is one mode segment: walk, bus ride, metro ride, etc.
    """

    mode: str = Field(
        description="Transport mode: Walk, Bus, Metro, Train, Ferry",
    )

    mode_label: str = Field(
        default="",
        description="Friendly label: 'MTC Bus 51C', 'CMRL Metro Blue Line', 'SR Suburban'",
    )

    instruction: str = Field(
        description="Human-readable instruction: 'Take 51C from Marina Beach to T Nagar'",
    )

    from_name: str = Field(
        description="Starting point of this step",
    )

    to_name: str = Field(
        description="Ending point of this step",
    )

    departure_time: Optional[datetime] = None
    arrival_time: Optional[datetime] = None

    duration_minutes: Optional[float] = Field(
        default=None,
        description="Duration of this step in minutes",
    )

    distance_km: Optional[float] = Field(
        default=None,
        description="Distance for walking steps",
    )

    # ── Transit details (null for walking steps) ──
    route_name: Optional[str] = Field(
        default=None,
        description="Route identifier: '51C', 'Blue Line', 'EMU'",
    )

    route_type: Optional[int] = Field(
        default=None,
        description="GTFS route_type: 0=Tram, 1=Metro, 2=Train, 3=Bus, 4=Ferry",
    )

    agency: Optional[str] = Field(
        default=None,
        description="Transit agency: 'MTC', 'CMRL', 'SR'",
    )

    trip_id: Optional[str] = None
    service_id: Optional[str] = None

    board_stop: Optional[str] = Field(
        default=None,
        description="Stop name where user boards",
    )

    alight_stop: Optional[str] = Field(
        default=None,
        description="Stop name where user alights",
    )

    # ── Frequency-based service ──
    is_frequency_based: bool = Field(
        default=False,
        description="True if this is a headway-based service (e.g., metro)",
    )

    headway_seconds: Optional[int] = Field(
        default=None,
        description="Headway between services in seconds",
    )

    frequency_window: Optional[str] = Field(
        default=None,
        description="Frequency window: '08:00:00-11:00:00'",
    )

    wait_time_minutes: Optional[float] = Field(
        default=None,
        description="Estimated wait time for the next vehicle",
    )


class ItineraryLeg(BaseModel):
    """
    Represents travel between two consecutive places in an itinerary.
    Contains actual transit details from the Routing Engine.
    """

    from_place_name: str
    to_place_name: str

    from_latitude: float
    from_longitude: float
    to_latitude: float
    to_longitude: float

    # ── Timing ──
    depart_at: datetime = Field(
        description="When the user leaves the from_place",
    )
    arrive_at: datetime = Field(
        description="When the user arrives at the to_place",
    )
    travel_duration_minutes: float = Field(
        description="Total travel time including walking and transit",
    )

    # ── Transit details (null if walking is the only option) ──
    mode: str = Field(
        description="Primary transport mode: Walk, Bus, Metro, Train, or Walk+Bus, etc.",
    )

    mode_label: str = Field(
        default="",
        description="Friendly mode label: 'MTC Bus', 'CMRL Metro', 'SR Suburban Train'",
    )

    transit_available: bool = Field(
        default=False,
        description="True if public transit was found for this leg",
    )

    # Walking details
    walking_distance_km: float = Field(
        default=0.0,
        description="Total walking distance for this leg",
    )
    walking_minutes: float = Field(
        default=0.0,
        description="Total walking time for this leg",
    )

    # Transit details (when transit_available=True)
    route_name: Optional[str] = Field(
        default=None,
        description="e.g., '51C', 'Blue Line', 'EMU'",
    )
    route_type: Optional[int] = Field(
        default=None,
        description="GTFS route_type (0=Tram, 1=Metro, 2=Train, 3=Bus)",
    )
    agency: Optional[str] = Field(
        default=None,
        description="Transit agency: 'MTC', 'CMRL', 'SR'",
    )
    trip_id: Optional[str] = None
    service_id: Optional[str] = None
    board_stop: Optional[str] = Field(
        default=None,
        description="Stop name where user boards",
    )
    alight_stop: Optional[str] = Field(
        default=None,
        description="Stop name where user alights",
    )
    wait_time_minutes: float = Field(
        default=0.0,
        description="Time waiting at the stop for the transit vehicle",
    )
    transit_time_minutes: float = Field(
        default=0.0,
        description="Time on the transit vehicle",
    )
    transfers: int = Field(
        default=0,
        description="Number of transfers in this leg",
    )

    # ── Detailed route steps ──
    route_steps: list[RouteStepDetail] = Field(
        default_factory=list,
        description="Detailed step-by-step breakdown of this leg",
    )

    # Full route steps (for detailed display)
    steps_summary: list[str] = Field(
        default_factory=list,
        description="Human-readable steps for this leg",
    )

    # ── Fare estimation ──
    fare_total: float = Field(
        default=0.0,
        description="Estimated fare for this leg in INR",
    )
    fare_breakdown: dict = Field(
        default_factory=dict,
        description="Fare breakdown: {base: 5, distance: 3.5, total: 8.5}",
    )
    fare_notes: list[str] = Field(
        default_factory=list,
        description="Notes about fare estimation",
    )


class CombinationRequest(BaseModel):
    places: list[PlaceInput] = Field(
        min_length=1,
        max_length=100,
    )

    available_hours: float = Field(
        gt=0,
        description="Total hours the user has for the entire trip",
    )

    # ── When the user starts ──
    departure_time: datetime = Field(
        description="When the user starts their journey (e.g., 2024-01-15T09:00:00)",
    )

    start_location: Optional[Location] = Field(
        default=None,
        description="User's starting location (if different from first place)",
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

    # ── Fallback ──
    fallback_walk_speed_kmph: float = Field(
        default=5.0,
        gt=0,
        description="Walking speed if no transit available",
    )

    # Maximum number of itineraries to return
    limit: int = Field(
        default=5,
        ge=1,
        le=20,
    )

    # ── Nearby food top-up ──
    # If none of `places` is already a food stop, the engine looks for
    # nearby food places and folds the best-fitting one(s) into each
    # itinerary — so a plan of sights also comes with somewhere to eat.
    include_nearby_food: bool = Field(
        default=True,
        description="Auto-include a nearby food place if the selection doesn't already have one",
    )

    food_search_radius_km: float = Field(
        default=2.5,
        gt=0,
        le=10,
        description="Search radius (around the selected places) for topping up with nearby food",
    )


class CombinationPlace(BaseModel):
    id: int
    name: str

    order: int

    latitude: float
    longitude: float

    visit_duration_hr: float

    score: float

    # ── Timing in the itinerary ──
    arrive_at: Optional[datetime] = Field(
        default=None,
        description="When the user arrives at this place",
    )
    depart_at: Optional[datetime] = Field(
        default=None,
        description="When the user leaves this place",
    )
    best_time_of_day: list[str] = Field(
        default_factory=list,
        description="When this place is best visited",
    )

    # 'poi' or 'food' — carried through so the UI can flag the food stop(s)
    # in a plan distinctly from the sightseeing stops.
    source: str = Field(
        default="poi",
        description="'poi' or 'food'",
    )


class ItineraryResult(BaseModel):
    itinerary_number: int

    places: list[CombinationPlace]

    # ── Timing ──
    start_time: datetime = Field(
        description="When the user departs from origin",
    )
    end_time: datetime = Field(
        description="When the user returns/finishes",
    )
    total_time_hr: float

    # ── Legs between places ──
    legs: list[ItineraryLeg] = Field(
        default_factory=list,
        description="Travel connections between consecutive places",
    )

    # ── Breakdown ──
    total_visit_time_hr: float
    total_travel_time_hr: float
    total_walking_time_hr: float = Field(
        default=0.0,
        description="Total time walking (including first/last mile)",
    )
    total_transit_time_hr: float = Field(
        default=0.0,
        description="Total time on public transport",
    )
    total_wait_time_hr: float = Field(
        default=0.0,
        description="Total time waiting for transit",
    )

    # ── Quality ──
    average_place_score: float

    # ── Feasibility ──
    all_legs_have_transit: bool = Field(
        default=False,
        description="True if every leg has public transit available",
    )
    transit_availability_summary: str = Field(
        default="",
        description="Human-readable summary: '3/3 legs have transit' or '2/3 legs (leg 2: walking only)'",
    )

    # ── Fare summary ──
    total_fare: float = Field(
        default=0.0,
        description="Total estimated fare for this itinerary in INR",
    )
    fare_breakdown: dict = Field(
        default_factory=dict,
        description="Fare by mode: {bus: 15, metro: 30, train: 0}",
    )
    fare_notes: list[str] = Field(
        default_factory=list,
        description="Notes about fare estimation",
    )


class CombinationResponse(BaseModel):
    total_itineraries: int

    available_hours: float
    departure_time: datetime

    itineraries: list[ItineraryResult]
