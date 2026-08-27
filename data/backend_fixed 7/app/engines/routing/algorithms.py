from datetime import datetime


def walking_time_minutes(
    distance_km: float,
    walking_speed_kmph: float = 5.0,
) -> float:
    """
    Estimate walking duration.
    """

    return (
        distance_km / walking_speed_kmph
    ) * 60


def seconds_to_minutes(
    seconds: float,
) -> float:
    return seconds / 60


def calculate_total_duration_minutes(
    departure: datetime,
    arrival: datetime,
) -> float:
    return (
        arrival - departure
    ).total_seconds() / 60