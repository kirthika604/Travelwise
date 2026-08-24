from typing import Optional
from pydantic import BaseModel


class PlaceSummary(BaseModel):
    id: int
    source: str                 # 'poi' | 'food'
    name: str
    category: str
    budget_level: Optional[str]
    rating: Optional[float]
    lat: float
    lon: float
    distance_km: Optional[float] = None   # populated only when a near= query is used


class PlaceDetail(PlaceSummary):
    description: Optional[str]
    entry_fee_min: Optional[float]
    entry_fee_max: Optional[float]
    avg_expense_min: Optional[float]
    avg_expense_max: Optional[float]
    time_needed_min_hr: Optional[float]
    time_needed_max_hr: Optional[float]
    time_needed_raw: Optional[str]
    best_time_of_day: Optional[list[str]]
    best_season: Optional[str]
    tags: list[str]
    cuisines: list[str]


class NearbyStop(BaseModel):
    stop_id: str
    stop_name: str
    lat: float
    lon: float
    distance_m: float
    route_short_names: list[str]   # which lines serve this stop
    modes: list[int]               # GTFS route_type values present at this stop


class Departure(BaseModel):
    trip_id: str
    route_id: str
    route_short_name: Optional[str]
    departure_time: str            # 'HH:MM:SS', may exceed 24:00:00 for post-midnight trips
    service_id: str
