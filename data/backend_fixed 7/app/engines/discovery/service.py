from math import isfinite

from .repository import DiscoveryRepository
from .schemas import (
    DiscoveryRequest,
    DiscoveryResponse,
    PlaceResult,
)


class DiscoveryService:

    def __init__(self, repository: DiscoveryRepository):
        self.repository = repository

    @staticmethod
    def normalize(value: float, minimum: float, maximum: float) -> float:
        """
        Normalize a value to the range 0.0 - 1.0.
        """
        if maximum == minimum:
            return 1.0

        score = (value - minimum) / (maximum - minimum)

        return max(0.0, min(1.0, score))

    @staticmethod
    def interest_score(
        interests: list[str],
        category: str,
        tags: list[str],
        cuisines: list[str],
    ) -> float:

        # No interest preference = neutral score
        if not interests:
            return 1.0

        searchable_values = [
            category.lower(),
            *[tag.lower() for tag in tags],
            *[cuisine.lower() for cuisine in cuisines],
        ]

        requested = [
            interest.lower().strip()
            for interest in interests
            if interest.strip()
        ]

        if not requested:
            return 1.0

        matches = 0

        for interest in requested:
            if any(
                interest in value or value in interest
                for value in searchable_values
            ):
                matches += 1

        return matches / len(requested)

    @staticmethod
    def budget_score(
        user_budget: str | None,
        place_budget: str | None,
    ) -> float:

        # No budget preference or unknown place budget
        if not user_budget or not place_budget:
            return 1.0

        budget_values = {
            "Low": 1,
            "Medium": 2,
            "High": 3,
        }

        user_value = budget_values.get(user_budget)
        place_value = budget_values.get(place_budget)

        if user_value is None or place_value is None:
            return 0.5

        difference = abs(user_value - place_value)

        if difference == 0:
            return 1.0

        if difference == 1:
            return 0.5

        return 0.0

    @staticmethod
    def time_score(
        available_hours: float | None,
        min_hours: float | None,
        max_hours: float | None,
    ) -> float:

        if available_hours is None:
            return 1.0

        # Unknown duration
        if min_hours is None and max_hours is None:
            return 0.5

        required_time = (
            min_hours
            if min_hours is not None
            else max_hours
        )

        if required_time is None:
            return 0.5

        # Doesn't fit
        if required_time > available_hours:
            return 0.0

        # Perfectly fills the available time
        if max_hours is not None and max_hours <= available_hours:
            return 1.0

        # Otherwise calculate proportional fit
        return min(1.0, required_time / available_hours)

    @staticmethod
    def distance_score(
        distance_km: float | None,
        radius_km: float | None,
    ) -> float:

        # Location wasn't provided
        if distance_km is None or radius_km is None:
            return 1.0

        if radius_km <= 0:
            return 0.0

        # Closer = better
        score = 1.0 - (distance_km / radius_km)

        return max(0.0, min(1.0, score))

    @staticmethod
    def rating_score(rating: float | None) -> float:

        # POIs don't necessarily have ratings in your schema.
        # Unknown rating gets neutral score.
        if rating is None:
            return 0.5

        # Database rating is expected on 0-5 scale
        return max(0.0, min(1.0, rating / 5.0))

    async def discover(
        self,
        request: DiscoveryRequest,
    ) -> DiscoveryResponse:

        rows = await self.repository.get_candidate_places(
            budget=request.budget,
            available_hours=request.available_hours,
            latitude=request.latitude,
            longitude=request.longitude,
            radius_km=request.radius_km,
            preferred_time=request.preferred_time,
            source=request.source,
        )

        results: list[PlaceResult] = []

        for row in rows:

            tags = list(row["tags"] or [])
            cuisines = list(row["cuisines"] or [])

            distance = row["distance_km"]

            if distance is not None:
                distance = float(distance)

            i_score = self.interest_score(
                interests=request.interests,
                category=row["category"],
                tags=tags,
                cuisines=cuisines,
            )

            b_score = self.budget_score(
                user_budget=request.budget,
                place_budget=row["budget_level"],
            )

            t_score = self.time_score(
                available_hours=request.available_hours,
                min_hours=(
                    float(row["time_needed_min_hr"])
                    if row["time_needed_min_hr"] is not None
                    else None
                ),
                max_hours=(
                    float(row["time_needed_max_hr"])
                    if row["time_needed_max_hr"] is not None
                    else None
                ),
            )

            d_score = self.distance_score(
                distance_km=distance,
                radius_km=request.radius_km,
            )

            r_score = self.rating_score(
                float(row["rating"])
                if row["rating"] is not None
                else None
            )

            # ALL FIVE FACTORS HAVE EQUAL IMPORTANCE
            final_score = (
                i_score
                + b_score
                + t_score
                + d_score
                + r_score
            ) / 5.0

            results.append(
                PlaceResult(
                    id=row["id"],
                    name=row["name"],
                    source=row["source"],
                    description=row["description"],
                    category=row["category"],

                    budget_level=row["budget_level"],

                    entry_fee_min=(
                        float(row["entry_fee_min"])
                        if row["entry_fee_min"] is not None
                        else None
                    ),
                    entry_fee_max=(
                        float(row["entry_fee_max"])
                        if row["entry_fee_max"] is not None
                        else None
                    ),

                    avg_expense_min=(
                        float(row["avg_expense_min"])
                        if row["avg_expense_min"] is not None
                        else None
                    ),
                    avg_expense_max=(
                        float(row["avg_expense_max"])
                        if row["avg_expense_max"] is not None
                        else None
                    ),

                    time_needed_min_hr=(
                        float(row["time_needed_min_hr"])
                        if row["time_needed_min_hr"] is not None
                        else None
                    ),
                    time_needed_max_hr=(
                        float(row["time_needed_max_hr"])
                        if row["time_needed_max_hr"] is not None
                        else None
                    ),

                    best_time_of_day=list(
                        row["best_time_of_day"] or []
                    ),

                    rating=(
                        float(row["rating"])
                        if row["rating"] is not None
                        else None
                    ),

                    image_url=row["image_url"],
                    location_url=row["location_url"],

                    latitude=float(row["lat"]),
                    longitude=float(row["lon"]),

                    distance_km=distance,

                    interest_score=round(i_score, 3),
                    budget_score=round(b_score, 3),
                    time_score=round(t_score, 3),
                    distance_score=round(d_score, 3),
                    rating_score=round(r_score, 3),

                    final_score=round(final_score, 3),

                    tags=tags,
                    cuisines=cuisines,
                )
            )

        # Highest-ranked place first
        results.sort(
            key=lambda place: place.final_score,
            reverse=True,
        )

        # Apply requested limit after ranking
        results = results[:request.limit]

        return DiscoveryResponse(
            total_results=len(results),
            places=results,
        )