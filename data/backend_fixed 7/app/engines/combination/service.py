"""
Combination Engine Service with Real Transit Availability.

Instead of using a fake 25 km/h speed estimate, this service:
1. Checks if transit (bus/train/metro) is actually available between places
2. Uses real departure/arrival times from GTFS schedules
3. Falls back to walking if no transit is available
4. Builds detailed itineraries with transit legs

Flow:
1. User provides places + departure_time + available_hours
2. For each candidate itinerary:
   a. Start at departure_time at the first place (or start_location)
   b. After visiting place N, check transit to place N+1
   c. If transit available: use actual travel time
   d. If no transit: use walking or skip that combination
   e. Continue until time budget exhausted
3. Return itineraries with real timing and transit details

Supports:
  - Live location → destination routing (uses MultiModalRouter)
  - Clear Bus/Metro/Train distinction with agency labels
  - Multimodal connections (Bus→Metro, Metro→Train, etc.)
  - Time-based availability (weekday/weekend service filtering)
"""

from datetime import datetime, timedelta

from .algorithms import (
    get_visit_duration,
    haversine_distance_km,
)
from .schemas import (
    CombinationPlace,
    CombinationRequest,
    CombinationResponse,
    ItineraryLeg,
    ItineraryResult,
    PlaceInput,
    RouteStepDetail,
)
from .transit_checker import TransitAvailabilityChecker, TransitConnection
from .fare_calculator import FareCalculator
from ..routing.transit_repository import TransitRepository
from ..routing.schemas import RoutingRequest, Location as RoutingLocation
from ..discovery.repository import DiscoveryRepository


class CombinationService:

    def __init__(
        self,
        repository: TransitRepository,
        discovery_repository: 'DiscoveryRepository | None' = None,
    ):
        self.repository = repository
        self.checker = TransitAvailabilityChecker(repository)
        self.fare_calculator = FareCalculator()
        # Optional: used to top up a plan with a nearby food place when the
        # user's own selection doesn't include one. None (e.g. in tests)
        # just disables the top-up — everything else behaves as before.
        self.discovery_repository = discovery_repository

    async def combine(
        self,
        request: CombinationRequest,
    ) -> CombinationResponse:
        """
        Create itineraries using real transit availability.
        """

        # Sort places by score (best first)
        sorted_places = sorted(
            request.places,
            key=lambda place: place.final_score,
            reverse=True,
        )

        # ── Top up with nearby food if the selection has none ──
        # These are added as *extra candidates* only (never as a forced
        # starting point) — the itinerary builder below is biased to slot
        # one in when it fits the time budget, so "sights + a place to eat
        # nearby" comes out of the box even if the user only picked POIs.
        food_candidates: list[PlaceInput] = []
        has_food_already = any(p.source == "food" for p in request.places)

        if (
            request.include_nearby_food
            and not has_food_already
            and self.discovery_repository is not None
        ):
            food_candidates = await self._nearby_food_candidates(
                places=request.places,
                radius_km=request.food_search_radius_km,
            )

        itineraries: list[ItineraryResult] = []
        used_place_sets: list[set[int]] = []

        # ── Try each place as a starting point ──
        for start_idx, starting_place in enumerate(sorted_places):

            if len(itineraries) >= request.limit:
                break

            # ── Build itinerary starting from this place ──
            itinerary = await self._build_itinerary(
                starting_place=starting_place,
                candidates=sorted_places,
                extra_candidates=food_candidates,
                departure_time=request.departure_time,
                available_hours=request.available_hours,
                start_location=request.start_location,
                max_walking_distance_km=request.max_walking_distance_km,
                max_transfers_per_leg=request.max_transfers_per_leg,
                fallback_walk_speed_kmph=request.fallback_walk_speed_kmph,
            )

            if itinerary is None:
                continue

            # ── Check for duplicate place combinations ──
            place_ids = frozenset(p.id for p in itinerary.places)

            if any(pset == place_ids for pset in used_place_sets):
                continue

            used_place_sets.append(place_ids)

            # ── Renumber ──
            itinerary.itinerary_number = len(itineraries) + 1
            for i, place in enumerate(itinerary.places, start=1):
                place.order = i

            itineraries.append(itinerary)

        # ── Sort: more places + higher score first ──
        itineraries.sort(
            key=lambda it: (
                len(it.places),
                it.average_place_score,
            ),
            reverse=True,
        )

        # ── Renumber after sorting ──
        for idx, it in enumerate(itineraries, start=1):
            it.itinerary_number = idx

        return CombinationResponse(
            total_itineraries=len(itineraries),
            available_hours=request.available_hours,
            departure_time=request.departure_time,
            itineraries=itineraries,
        )

    async def _build_itinerary(
        self,
        starting_place: PlaceInput,
        candidates: list[PlaceInput],
        departure_time: datetime,
        available_hours: float,
        start_location: 'Location | None',
        max_walking_distance_km: float,
        max_transfers_per_leg: int,
        fallback_walk_speed_kmph: float,
        extra_candidates: list[PlaceInput] | None = None,
    ) -> ItineraryResult | None:
        """
        Build a complete itinerary starting from starting_place.
        Uses real transit availability for each leg.
        """

        selected_places: list[PlaceInput] = [starting_place]
        legs: list[ItineraryLeg] = []

        # ── Track timing ──
        current_time = departure_time
        total_visit_minutes = 0.0
        total_travel_minutes = 0.0
        total_walking_minutes = 0.0
        total_transit_minutes = 0.0
        total_wait_minutes = 0.0

        # ── If start_location is provided, add first leg to starting_place ──
        if start_location:
            first_leg = await self._find_leg(
                from_lat=start_location.latitude,
                from_lon=start_location.longitude,
                to_lat=starting_place.latitude,
                to_lon=starting_place.longitude,
                depart_at=current_time,
                max_walking_distance_km=max_walking_distance_km,
                max_transfers=max_transfers_per_leg,
                fallback_walk_speed_kmph=fallback_walk_speed_kmph,
            )

            if first_leg is None:
                return None  # Can't even reach the starting place

            # Fill in place names
            first_leg.from_place_name = "Your Location"
            first_leg.to_place_name = starting_place.name

            legs.append(first_leg)
            current_time = first_leg.arrive_at
            total_travel_minutes += first_leg.travel_duration_minutes
            total_walking_minutes += first_leg.walking_minutes
            total_transit_minutes += first_leg.transit_time_minutes
            total_wait_minutes += first_leg.wait_time_minutes

        # ── Visit starting place ──
        visit_min = get_visit_duration(starting_place) * 60
        total_visit_minutes += visit_min
        current_time += timedelta(minutes=visit_min)

        # ── Greedy: add nearest places that fit in time budget ──
        remaining = [
            p for p in candidates if p.id != starting_place.id
        ]

        # Fold in the nearby-food top-ups (deduped against what's already
        # in the pool) — they're only ever *candidates*, picked up by the
        # greedy loop below like anything else.
        if extra_candidates:
            existing_ids = {p.id for p in remaining} | {starting_place.id}
            for food_place in extra_candidates:
                if food_place.id not in existing_ids:
                    remaining.append(food_place)
                    existing_ids.add(food_place.id)

        while remaining:
            # ── Time budget check ──
            elapsed_minutes = (current_time - departure_time).total_seconds() / 60
            remaining_budget_minutes = (available_hours * 60) - elapsed_minutes

            if remaining_budget_minutes <= 0:
                break

            # ── Find best next place ──
            best_connection = None
            best_place = None
            best_leg = None

            for candidate in remaining:
                # Estimate visit time
                candidate_visit_min = get_visit_duration(candidate) * 60

                # Find transit connection
                leg = await self._find_leg(
                    from_lat=selected_places[-1].latitude,
                    from_lon=selected_places[-1].longitude,
                    to_lat=candidate.latitude,
                    to_lon=candidate.longitude,
                    depart_at=current_time,
                    max_walking_distance_km=max_walking_distance_km,
                    max_transfers=max_transfers_per_leg,
                    fallback_walk_speed_kmph=fallback_walk_speed_kmph,
                )

                if leg is None:
                    continue

                # Check if this leg + visit fits in remaining time
                leg_total = leg.travel_duration_minutes + candidate_visit_min
                if leg_total > remaining_budget_minutes:
                    continue

                # Prefer: less travel time + higher place score. A candidate
                # that's a food place gets a bump while the plan doesn't yet
                # have one, so "somewhere to eat nearby" tends to make the
                # cut instead of always losing out to another sight.
                score = candidate.final_score * 100 - leg.travel_duration_minutes

                already_has_food = any(
                    p.source == "food" for p in selected_places
                )
                if candidate.source == "food" and not already_has_food:
                    score += 35

                if best_connection is None or score > best_connection:
                    best_connection = score
                    best_place = candidate
                    best_leg = leg

            if best_place is None or best_leg is None:
                break  # No more places fit

            # ── Add this leg and place ──
            # Fill in place names
            best_leg.from_place_name = selected_places[-1].name
            best_leg.to_place_name = best_place.name

            legs.append(best_leg)
            selected_places.append(best_place)

            current_time = best_leg.arrive_at
            total_travel_minutes += best_leg.travel_duration_minutes
            total_walking_minutes += best_leg.walking_minutes
            total_transit_minutes += best_leg.transit_time_minutes
            total_wait_minutes += best_leg.wait_time_minutes

            # Visit the place
            visit_min = get_visit_duration(best_place) * 60
            total_visit_minutes += visit_min
            current_time += timedelta(minutes=visit_min)

            remaining = [
                p for p in remaining if p.id != best_place.id
            ]

        # ── Need at least 1 place ──
        if not selected_places:
            return None

        # ── Build result ──
        total_travel_hr = total_travel_minutes / 60
        total_visit_hr = total_visit_minutes / 60
        total_walking_hr = total_walking_minutes / 60
        total_transit_hr = total_transit_minutes / 60
        total_wait_hr = total_wait_minutes / 60
        total_time_hr = total_travel_hr + total_visit_hr

        # ── Build place results with timing ──
        place_results = []
        place_time = departure_time

        # Adjust for first leg travel if start_location provided
        if start_location and legs:
            place_time = legs[0].arrive_at

        for idx, place in enumerate(selected_places):
            arrive = place_time
            visit_min = get_visit_duration(place) * 60
            depart = arrive + timedelta(minutes=visit_min)

            place_results.append(CombinationPlace(
                id=place.id,
                name=place.name,
                order=idx + 1,
                latitude=place.latitude,
                longitude=place.longitude,
                visit_duration_hr=round(visit_min / 60, 2),
                score=round(place.final_score, 3),
                arrive_at=arrive,
                depart_at=depart,
                best_time_of_day=place.best_time_of_day,
                source=place.source,
            ))

            place_time = depart

            # Add travel time to next place (if not last)
            if idx < len(legs):
                place_time = legs[idx].arrive_at

        # ── Transit availability summary ──
        legs_with_transit = sum(1 for leg in legs if leg.transit_available)
        total_legs = len(legs)

        if total_legs == 0:
            summary = "No travel between places"
            all_have_transit = True
        elif legs_with_transit == total_legs:
            summary = f"All {total_legs} legs have transit"
            all_have_transit = True
        else:
            summary = f"{legs_with_transit}/{total_legs} legs have transit"
            all_have_transit = False

        # ── Average score ──
        avg_score = (
            sum(p.final_score for p in selected_places)
            / len(selected_places)
        )

        # ── Calculate fares ──
        fare_summary = self._calculate_itinerary_fares(legs)

        return ItineraryResult(
            itinerary_number=0,  # Will be set by caller
            places=place_results,
            start_time=departure_time,
            end_time=current_time,
            total_time_hr=round(total_time_hr, 2),
            legs=legs,
            total_visit_time_hr=round(total_visit_hr, 2),
            total_travel_time_hr=round(total_travel_hr, 2),
            total_walking_time_hr=round(total_walking_hr, 2),
            total_transit_time_hr=round(total_transit_hr, 2),
            total_wait_time_hr=round(total_wait_hr, 2),
            average_place_score=round(avg_score, 3),
            all_legs_have_transit=all_have_transit,
            transit_availability_summary=summary,
            total_fare=fare_summary.total_fare,
            fare_breakdown=fare_summary.fare_breakdown if hasattr(fare_summary, 'fare_breakdown') else {},
            fare_notes=fare_summary.notes or [],
        )

    async def _find_leg(
        self,
        from_lat: float,
        from_lon: float,
        to_lat: float,
        to_lon: float,
        depart_at: datetime,
        max_walking_distance_km: float,
        max_transfers: int,
        fallback_walk_speed_kmph: float,
    ) -> ItineraryLeg | None:
        """
        Find a transit leg between two points.
        Returns ItineraryLeg with all details, or None if failed.
        """

        connection = await self.checker.find_best_connection(
            from_lat=from_lat,
            from_lon=from_lon,
            to_lat=to_lat,
            to_lon=to_lon,
            depart_at=depart_at,
            max_walking_distance_km=max_walking_distance_km,
            max_transfers=max_transfers,
            fallback_walk_speed_kmph=fallback_walk_speed_kmph,
        )

        if connection is None:
            return None

        # ── Calculate fare for this leg ──
        leg_fare = self.fare_calculator.calculate_leg_fare(
            mode=connection.mode,
            distance_km=connection.walking_distance_km,
            route_type=connection.route_type,
            route_name=connection.route_name,
            transfers=connection.transfers,
        )

        # ── Convert route_steps to RouteStepDetail ──
        route_steps = []
        if connection.route_steps:
            for step in connection.route_steps:
                route_steps.append(RouteStepDetail(
                    mode=step.get("mode", "Walk"),
                    mode_label=step.get("mode_label", ""),
                    instruction=step.get("instruction", ""),
                    from_name=step.get("from_name", ""),
                    to_name=step.get("to_name", ""),
                    departure_time=step.get("departure_time"),
                    arrival_time=step.get("arrival_time"),
                    duration_minutes=step.get("duration_minutes"),
                    distance_km=step.get("distance_km"),
                    route_name=step.get("route_name"),
                    route_type=step.get("route_type"),
                    agency=step.get("agency"),
                    trip_id=step.get("trip_id"),
                    service_id=step.get("service_id"),
                    board_stop=step.get("board_stop"),
                    alight_stop=step.get("alight_stop"),
                ))

        return ItineraryLeg(
            from_place_name="",  # Will be filled by caller
            to_place_name="",
            from_latitude=from_lat,
            from_longitude=from_lon,
            to_latitude=to_lat,
            to_longitude=to_lon,
            depart_at=connection.depart_at,
            arrive_at=connection.arrive_at,
            travel_duration_minutes=connection.travel_duration_minutes,
            mode=connection.mode,
            mode_label=connection.mode_label,
            transit_available=connection.transit_available,
            walking_distance_km=connection.walking_distance_km,
            walking_minutes=connection.walking_minutes,
            route_name=connection.route_name,
            route_type=connection.route_type,
            agency=connection.agency,
            trip_id=connection.trip_id,
            service_id=connection.service_id,
            board_stop=connection.board_stop,
            alight_stop=connection.alight_stop,
            wait_time_minutes=connection.wait_time_minutes,
            transit_time_minutes=connection.transit_time_minutes,
            transfers=connection.transfers,
            route_steps=route_steps,
            steps_summary=connection.steps_summary or [],
            fare_total=leg_fare.total_leg_fare,
            fare_breakdown={
                "base": leg_fare.transit_fares[0].base_fare if leg_fare.transit_fares else 0,
                "distance": leg_fare.transit_fares[0].distance_fare if leg_fare.transit_fares else 0,
                "total": leg_fare.total_leg_fare,
            } if leg_fare.transit_fares else {},
            fare_notes=[f"Estimated: ₹{leg_fare.total_leg_fare:.0f}"],
        )

    async def _nearby_food_candidates(
        self,
        places: list[PlaceInput],
        radius_km: float,
        limit: int = 5,
    ) -> list[PlaceInput]:
        """
        Look up nearby food places (source='food') around the centroid of
        the user's selected places, and turn them into PlaceInput candidates
        the itinerary builder can pick from. Never raises — if the lookup
        fails for any reason, plans are simply built without a food top-up.
        """

        if not places:
            return []

        centroid_lat = sum(p.latitude for p in places) / len(places)
        centroid_lon = sum(p.longitude for p in places) / len(places)

        try:
            rows = await self.discovery_repository.get_candidate_places(
                latitude=centroid_lat,
                longitude=centroid_lon,
                radius_km=radius_km,
                source="food",
            )
        except Exception:
            return []

        existing_ids = {p.id for p in places}

        candidates: list[PlaceInput] = []
        for row in rows:
            if row["id"] in existing_ids:
                continue

            rating = float(row["rating"]) if row["rating"] is not None else None
            distance_km = (
                float(row["distance_km"])
                if row["distance_km"] is not None
                else None
            )

            # Simple, self-contained score (rating + closeness) — food
            # top-ups aren't run through the full Discovery scoring pass,
            # this just needs to be "good enough" to rank the food options
            # against each other and against the user's own picks.
            rating_component = rating / 5.0 if rating is not None else 0.6
            distance_component = (
                max(0.0, min(1.0, 1.0 - (distance_km / radius_km)))
                if distance_km is not None
                else 0.6
            )
            score = (rating_component + distance_component) / 2

            candidates.append(PlaceInput(
                id=row["id"],
                name=row["name"],
                latitude=float(row["lat"]),
                longitude=float(row["lon"]),
                time_needed_min_hr=(
                    float(row["time_needed_min_hr"])
                    if row["time_needed_min_hr"] is not None
                    else 1.0
                ),
                time_needed_max_hr=(
                    float(row["time_needed_max_hr"])
                    if row["time_needed_max_hr"] is not None
                    else None
                ),
                final_score=round(score, 3),
                best_time_of_day=list(row["best_time_of_day"] or []),
                source="food",
            ))

        candidates.sort(key=lambda p: p.final_score, reverse=True)
        return candidates[:limit]

    def _calculate_itinerary_fares(
        self,
        legs: list[ItineraryLeg],
    ):
        """
        Calculate total fare for an itinerary.
        """
        from .fare_calculator import ItineraryFareSummary

        summary = ItineraryFareSummary(
            total_fare=0.0,
            bus_fare=0.0,
            metro_fare=0.0,
            train_fare=0.0,
            walking_fare=0.0,
            leg_fares=[],
            notes=[],
        )

        for leg in legs:
            summary.total_fare += leg.fare_total

            # Break down by mode
            if leg.transit_available:
                mode = leg.mode.split("+")[-1] if "+" in leg.mode else leg.mode
                if mode == "Bus":
                    summary.bus_fare += leg.fare_total
                elif mode == "Metro":
                    summary.metro_fare += leg.fare_total
                elif mode == "Train":
                    summary.train_fare += leg.fare_total

        summary.total_fare = round(summary.total_fare, 2)
        summary.bus_fare = round(summary.bus_fare, 2)
        summary.metro_fare = round(summary.metro_fare, 2)
        summary.train_fare = round(summary.train_fare, 2)

        summary.notes = [
            "Fares are estimates based on standard Chennai pricing",
            "Smart card discounts not applied (Metro: ~20% off)",
        ]

        return summary
