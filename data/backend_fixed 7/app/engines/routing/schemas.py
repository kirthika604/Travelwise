from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class Location(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class RoutePreferences(BaseModel):
    """
    User preferences for ranking and filtering routes.
    All fields are optional — omit to use defaults.
    """

    prefer_fewer_transfers: bool = Field(
        default=False,
        description="If true, heavily penalize routes with more transfers",
    )

    prefer_less_walking: bool = Field(
        default=False,
        description="If true, penalize routes with more total walking time",
    )

    prefer_modes: list[str] = Field(
        default_factory=list,
        description=(
            "List of preferred transport modes (e.g., ['Metro', 'Train']). "
            "Routes using these modes get a ranking boost."
        ),
    )

    avoid_modes: list[str] = Field(
        default_factory=list,
        description=(
            "List of modes to avoid (e.g., ['Bus']). "
            "Routes using these modes get a ranking penalty. "
            "Routes using ONLY avoided modes are excluded."
        ),
    )

    max_walking_minutes: float | None = Field(
        default=None,
        gt=0,
        description="Hard limit: reject routes with total walking time exceeding this (minutes).",
    )

    # ── Scoring weights ──
    # These control how much each factor contributes to the final score.
    # Defaults are tuned for general use; power users can override.

    weight_duration: float = Field(
        default=1.0,
        ge=0,
        description="Weight for travel duration in scoring (higher = care more about speed)",
    )

    weight_transfers: float = Field(
        default=0.5,
        ge=0,
        description="Weight for number of transfers in scoring",
    )

    weight_walking: float = Field(
        default=0.3,
        ge=0,
        description="Weight for total walking time in scoring",
    )

    weight_mode_preference: float = Field(
        default=0.2,
        ge=0,
        description="Weight for mode preference matching in scoring",
    )

    weight_wait_time: float = Field(
        default=0.3,
        ge=0,
        description=(
            "Weight for total time spent waiting between legs in scoring. "
            "Separate from weight_transfers: two routes can have the same "
            "transfer count but very different cumulative buffer time "
            "depending on how well the connections line up."
        ),
    )


class RoutingRequest(BaseModel):
    origin: Location
    destination: Location

    departure_time: datetime

    max_walking_distance_km: float = Field(
        default=1.0,
        gt=0,
        le=5.0,
    )

    max_results: int = Field(
        default=10,
        ge=1,
        le=50,
    )

    max_transfers: int = Field(
        default=5,
        ge=0,
        le=5,
        description=(
            "Maximum number of mode transfers allowed. Now counts every "
            "vehicle boarded after the first (previously only walking "
            "between stops counted, so a route stitched from many buses "
            "boarded one after another at the same stop looked like a "
            "single 0-transfer ride). Defaults to the max allowed rather "
            "than a low value — this is a hard cutoff, not a preference: "
            "capping it low prunes away real multi-bus routes entirely "
            "instead of letting the scorer (weight_transfers, "
            "weight_wait_time) rank them honestly behind better options."
        ),
    )

    preferences: RoutePreferences = Field(
        default_factory=RoutePreferences,
        description="User preferences for ranking and filtering routes",
    )


class RouteStep(BaseModel):
    mode: str  # Walk, Bus, Metro, Train, Ferry, Tram

    mode_label: str = Field(
        default="",
        description="Friendly label: 'MTC Bus 51C', 'CMRL Metro Blue Line', 'SR Suburban'",
    )

    agency: str = Field(
        default="",
        description="Transit agency: 'MTC', 'CMRL', 'SR'",
    )

    instruction: str

    from_name: str
    to_name: str

    departure_time: datetime | None = None
    arrival_time: datetime | None = None

    duration_minutes: float | None = None
    distance_km: float | None = None  # For walking steps

    route_name: str | None = None  # e.g., "M1", "51C", "EMU"
    route_type: int | None = None  # GTFS route_type (0=Tram, 1=Metro, 2=Train, 3=Bus, 4=Ferry)
    trip_id: str | None = None
    service_id: str | None = None

    board_stop: str | None = Field(
        default=None,
        description="Stop name where user boards",
    )
    alight_stop: str | None = Field(
        default=None,
        description="Stop name where user alights",
    )

    # ── Frequency-based service info ──
    is_frequency_based: bool = Field(
        default=False,
        description="True if this trip uses headway-based scheduling (e.g., metro)",
    )
    headway_seconds: int | None = Field(
        default=None,
        description="Headway between services in seconds (only for frequency-based trips)",
    )
    frequency_window: str | None = Field(
        default=None,
        description="The frequency window that applies (e.g., '08:00-11:00')",
    )
    wait_time_minutes: float | None = Field(
        default=None,
        description="Estimated wait time for the next vehicle (for frequency-based services)",
    )


class RouteResult(BaseModel):
    total_duration_minutes: float

    departure_time: datetime
    arrival_time: datetime

    transfers: int
    steps: list[RouteStep]

    modes_used: list[str] = Field(
        default_factory=list,
        description="List of transport modes used in this route",
    )

    total_walking_minutes: float = Field(
        default=0.0,
        description="Total time spent walking (transfers + first/last mile)",
    )

    total_wait_minutes: float = Field(
        default=0.0,
        description="Total buffer time spent waiting for a connection across all legs",
    )

    total_transit_minutes: float = Field(
        default=0.0,
        description="Total time on public transport",
    )

    # ── Scoring breakdown (for debugging / UI display) ──
    score_duration: float | None = Field(
        default=None,
        description="Normalized duration score (0=best, 1=worst among candidates)",
    )
    score_transfers: float | None = Field(
        default=None,
        description="Normalized transfer score",
    )
    score_walking: float | None = Field(
        default=None,
        description="Normalized walking score",
    )
    score_mode_preference: float | None = Field(
        default=None,
        description="Normalized mode preference score",
    )
    score_wait: float | None = Field(
        default=None,
        description="Normalized wait-time score",
    )
    final_score: float | None = Field(
        default=None,
        description="Final weighted score (lower = better)",
    )


class RoutingResponse(BaseModel):
    total_routes: int
    routes: list[RouteResult]
