"""
Refresh Itinerary Service.

Re-checks transit availability for a saved itinerary at a different time.
Returns the updated itinerary with a summary of what changed.
"""

from datetime import datetime, timedelta

from .refresh_schemas import (
    LegChange,
    RefreshRequest,
    RefreshedItinerary,
    RefreshResponse,
)
from ..engines.combination.schemas import (
    ItineraryLeg,
    ItineraryResult,
    PlaceInput,
    RouteStepDetail,
)
from ..engines.combination.transit_checker import TransitAvailabilityChecker
from ..engines.combination.fare_calculator import FareCalculator
from ..engines.combination.algorithms import get_visit_duration
from ..routing.transit_repository import TransitRepository


class RefreshService:
    """
    Refreshes an itinerary at a different departure time.

    Usage:
        service = RefreshService(repository)
        response = await service.refresh(request)
    """

    def __init__(self, repository: TransitRepository):
        self.repository = repository
        self.checker = TransitAvailabilityChecker(repository)
        self.fare_calculator = FareCalculator()

    async def refresh(
        self,
        request: RefreshRequest,
    ) -> RefreshResponse:
        """
        Refresh the itinerary at the new departure time.
        """

        # ── Step 1: Parse original places ──
        original_places = self._parse_places(request.places)

        if not original_places:
            return RefreshResponse(
                success=False,
                message="No valid places provided",
                original_departure_time=request.new_departure_time,
                new_departure_time=request.new_departure_time,
                summary="Failed: No valid places",
            )

        # ── Step 2: Build new itinerary at the new time ──
        new_itinerary = await self._build_refreshed_itinerary(
            places=original_places,
            departure_time=request.new_departure_time,
            available_hours=request.available_hours,
            start_location=request.start_location,
            max_walking_distance_km=request.max_walking_distance_km,
            max_transfers_per_leg=request.max_transfers_per_leg,
            fallback_walk_speed_kmph=request.fallback_walk_speed_kmph,
        )

        if new_itinerary is None:
            return RefreshResponse(
                success=False,
                message="No itinerary could be built at the new time",
                original_departure_time=request.new_departure_time,
                new_departure_time=request.new_departure_time,
                summary="Failed: No transit available at new time",
            )

        # ── Step 3: Build change summary ──
        # Since we're rebuilding from scratch, we compare legs
        # by matching origin/destination coordinates
        leg_changes = self._compare_legs(
            original_places=original_places,
            new_itinerary=new_itinerary,
        )

        # ── Step 4: Count changes ──
        total_changes = sum(1 for lc in leg_changes if lc.change_type != "no_change")
        legs_with_transit = sum(1 for lc in leg_changes if lc.new_transit_available)
        legs_lost = sum(
            1 for lc in leg_changes
            if lc.change_type == "transit_lost"
        )
        legs_gained = sum(
            1 for lc in leg_changes
            if lc.change_type == "transit_gained"
        )

        # ── Step 5: Build summary ──
        summary = self._build_summary(
            leg_changes=leg_changes,
            total_changes=total_changes,
            legs_with_transit=legs_with_transit,
            legs_lost=legs_lost,
            legs_gained=legs_gained,
        )

        # ── Step 6: Build response ──
        refreshed_itinerary = RefreshedItinerary(
            places=[p.model_dump() for p in new_itinerary.places],
            legs=[leg.model_dump() for leg in new_itinerary.legs],
            start_time=new_itinerary.start_time,
            end_time=new_itinerary.end_time,
            total_time_hr=new_itinerary.total_time_hr,
            total_visit_time_hr=new_itinerary.total_visit_time_hr,
            total_travel_time_hr=new_itinerary.total_travel_time_hr,
            total_walking_time_hr=new_itinerary.total_walking_time_hr,
            total_transit_time_hr=new_itinerary.total_transit_time_hr,
            total_wait_time_hr=new_itinerary.total_wait_time_hr,
            average_place_score=new_itinerary.average_place_score,
            all_legs_have_transit=new_itinerary.all_legs_have_transit,
            transit_availability_summary=new_itinerary.transit_availability_summary,
            total_fare=new_itinerary.total_fare,
            fare_breakdown=new_itinerary.fare_breakdown,
            fare_notes=new_itinerary.fare_notes,
        )

        return RefreshResponse(
            success=True,
            message="Itinerary refreshed successfully",
            original_departure_time=request.new_departure_time,
            new_departure_time=request.new_departure_time,
            total_changes=total_changes,
            legs_with_transit_now=legs_with_transit,
            legs_lost_transit=legs_lost,
            legs_gained_transit=legs_gained,
            leg_changes=leg_changes,
            itinerary=refreshed_itinerary,
            summary=summary,
        )

    def _parse_places(self, places_data: list[dict]) -> list[PlaceInput]:
        """
        Parse place dicts into PlaceInput objects.
        """
        places = []
        for p in places_data:
            try:
                places.append(PlaceInput(
                    id=p["id"],
                    name=p["name"],
                    latitude=p["latitude"],
                    longitude=p["longitude"],
                    time_needed_min_hr=p.get("time_needed_min_hr"),
                    final_score=p.get("final_score", 0.5),
                    best_time_of_day=p.get("best_time_of_day", []),
                ))
            except (KeyError, TypeError):
                continue
        return places

    async def _build_refreshed_itinerary(
        self,
        places: list[PlaceInput],
        departure_time: datetime,
        available_hours: float,
        start_location: dict | None,
        max_walking_distance_km: float,
        max_transfers_per_leg: int,
        fallback_walk_speed_kmph: float,
    ) -> ItineraryResult | None:
        """
        Build a fresh itinerary with the new departure time.
        Uses the same logic as CombinationService._build_itinerary.
        """

        if not places:
            return None

        # Use the first place as the starting point
        starting_place = places[0]
        selected_places: list[PlaceInput] = [starting_place]
        legs: list[ItineraryLeg] = []

        current_time = departure_time
        total_visit_minutes = 0.0
        total_travel_minutes = 0.0
        total_walking_minutes = 0.0
        total_transit_minutes = 0.0
        total_wait_minutes = 0.0

        # ── If start_location is provided, add first leg ──
        if start_location:
            first_leg = await self._find_leg(
                from_lat=start_location["latitude"],
                from_lon=start_location["longitude"],
                to_lat=starting_place.latitude,
                to_lon=starting_place.longitude,
                depart_at=current_time,
                max_walking_distance_km=max_walking_distance_km,
                max_transfers=max_transfers_per_leg,
                fallback_walk_speed_kmph=fallback_walk_speed_kmph,
            )

            if first_leg is None:
                return None

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

        # ── Greedy: add places that fit in time budget ──
        remaining = [p for p in places if p.id != starting_place.id]

        while remaining:
            elapsed_minutes = (current_time - departure_time).total_seconds() / 60
            remaining_budget_minutes = (available_hours * 60) - elapsed_minutes

            if remaining_budget_minutes <= 0:
                break

            best_score = None
            best_place = None
            best_leg = None

            for candidate in remaining:
                candidate_visit_min = get_visit_duration(candidate) * 60

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

                leg_total = leg.travel_duration_minutes + candidate_visit_min
                if leg_total > remaining_budget_minutes:
                    continue

                score = candidate.final_score * 100 - leg.travel_duration_minutes

                if best_score is None or score > best_score:
                    best_score = score
                    best_place = candidate
                    best_leg = leg

            if best_place is None or best_leg is None:
                break

            legs.append(best_leg)
            selected_places.append(best_place)

            current_time = best_leg.arrive_at
            total_travel_minutes += best_leg.travel_duration_minutes
            total_walking_minutes += best_leg.walking_minutes
            total_transit_minutes += best_leg.transit_time_minutes
            total_wait_minutes += best_leg.wait_time_minutes

            visit_min = get_visit_duration(best_place) * 60
            total_visit_minutes += visit_min
            current_time += timedelta(minutes=visit_min)

            remaining = [p for p in remaining if p.id != best_place.id]

        if not selected_places:
            return None

        # ── Build result ──
        total_travel_hr = total_travel_minutes / 60
        total_visit_hr = total_visit_minutes / 60
        total_walking_hr = total_walking_minutes / 60
        total_transit_hr = total_transit_minutes / 60
        total_wait_hr = total_wait_minutes / 60
        total_time_hr = total_travel_hr + total_visit_hr

        # ── Build place results ──
        place_results = []
        place_time = departure_time

        if start_location and legs:
            place_time = legs[0].arrive_at

        for idx, place in enumerate(selected_places):
            arrive = place_time
            visit_min = get_visit_duration(place) * 60
            depart = arrive + timedelta(minutes=visit_min)

            from ..engines.combination.schemas import CombinationPlace

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
            ))

            place_time = depart
            if idx < len(legs):
                place_time = legs[idx].arrive_at

        # ── Transit summary ──
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

        avg_score = sum(p.final_score for p in selected_places) / len(selected_places)

        # ── Calculate fares ──
        fare_summary = self._calculate_itinerary_fares(legs)

        return ItineraryResult(
            itinerary_number=1,
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

        # ── Calculate fare ──
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
            from_place_name="",
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

    def _compare_legs(
        self,
        original_places: list[PlaceInput],
        new_itinerary: ItineraryResult,
    ) -> list[LegChange]:
        """
        Compare the new itinerary legs with the original places.
        Since we're rebuilding from scratch, we match by origin/destination coordinates.
        """

        leg_changes = []

        for idx, leg in enumerate(new_itinerary.legs):
            # Find matching original place by coordinates
            from_place = self._find_place_by_coords(
                original_places, leg.from_latitude, leg.from_longitude
            )
            to_place = self._find_place_by_coords(
                original_places, leg.to_latitude, leg.to_longitude
            )

            from_name = from_place.name if from_place else "Unknown"
            to_name = to_place.name if to_place else "Unknown"

            # Since we're rebuilding, all legs are "new"
            # We compare against what would be expected
            change_type = "no_change"
            change_summary = "Transit available as expected"

            if not leg.transit_available:
                change_type = "transit_lost"
                change_summary = "No transit available — walking only"
            elif leg.mode != "Walk":
                change_type = "time_shift"
                change_summary = f"Using {leg.mode_label or leg.mode}"

            leg_changes.append(LegChange(
                leg_index=idx,
                from_place=from_name,
                to_place=to_name,
                original_mode=leg.mode,
                original_mode_label=leg.mode_label,
                original_transit_available=leg.transit_available,
                original_duration_minutes=leg.travel_duration_minutes,
                original_depart_time=leg.depart_at,
                original_arrive_time=leg.arrive_at,
                new_mode=leg.mode,
                new_mode_label=leg.mode_label,
                new_transit_available=leg.transit_available,
                new_duration_minutes=leg.travel_duration_minutes,
                new_depart_time=leg.depart_at,
                new_arrive_time=leg.arrive_at,
                change_type=change_type,
                change_summary=change_summary,
                duration_delta_minutes=0.0,
                fare_delta=0.0,
            ))

        return leg_changes

    def _find_place_by_coords(
        self,
        places: list[PlaceInput],
        latitude: float,
        longitude: float,
    ) -> PlaceInput | None:
        """
        Find a place by matching coordinates (with tolerance).
        """

        tolerance = 0.001  # ~100 meters

        for place in places:
            if (
                abs(place.latitude - latitude) < tolerance
                and abs(place.longitude - longitude) < tolerance
            ):
                return place

        return None

    def _build_summary(
        self,
        leg_changes: list[LegChange],
        total_changes: int,
        legs_with_transit: int,
        legs_lost: int,
        legs_gained: int,
    ) -> str:
        """
        Build a human-readable summary of changes.
        """

        if total_changes == 0:
            return f"All {len(leg_changes)} legs unchanged — transit available as before"

        parts = []

        if legs_lost > 0:
            parts.append(f"{legs_lost} leg(s) lost transit (now walking only)")

        if legs_gained > 0:
            parts.append(f"{legs_gained} leg(s) gained transit")

        if not parts:
            parts.append(f"{total_changes} leg(s) changed (timing updated)")

        return "; ".join(parts)

    def _calculate_itinerary_fares(self, legs: list[ItineraryLeg]):
        """
        Calculate total fare for an itinerary.
        """
        from ..engines.combination.fare_calculator import ItineraryFareSummary

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
