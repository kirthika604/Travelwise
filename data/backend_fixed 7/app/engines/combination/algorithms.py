from math import atan2, cos, radians, sin, sqrt

from .schemas import PlaceInput


def haversine_distance_km(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """
    Calculate straight-line distance between two coordinates.
    """

    earth_radius_km = 6371.0

    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)

    delta_lat = radians(lat2 - lat1)
    delta_lon = radians(lon2 - lon1)

    a = (
        sin(delta_lat / 2) ** 2
        + cos(lat1_rad)
        * cos(lat2_rad)
        * sin(delta_lon / 2) ** 2
    )

    c = 2 * atan2(
        sqrt(a),
        sqrt(1 - a),
    )

    return earth_radius_km * c


def get_visit_duration(
    place: PlaceInput,
) -> float:
    """
    Choose a practical visit duration.
    """

    if place.time_needed_min_hr is not None:
        return place.time_needed_min_hr

    if place.time_needed_max_hr is not None:
        return place.time_needed_max_hr

    # Default when data is unavailable
    return 1.0


def estimate_travel_time_hr(
    distance_km: float,
    speed_kmph: float,
) -> float:

    return distance_km / speed_kmph


def find_nearest_place(
    current_place: PlaceInput,
    candidates: list[PlaceInput],
) -> tuple[PlaceInput | None, float]:

    nearest_place = None
    nearest_distance = float("inf")

    for candidate in candidates:

        distance = haversine_distance_km(
            current_place.latitude,
            current_place.longitude,
            candidate.latitude,
            candidate.longitude,
        )

        if distance < nearest_distance:
            nearest_distance = distance
            nearest_place = candidate

    return nearest_place, nearest_distance