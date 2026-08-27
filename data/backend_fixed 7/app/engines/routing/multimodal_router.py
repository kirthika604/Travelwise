"""
Multi-modal transit router with frequency handling and preference-based scoring.

Features:
  - Walk → Bus → Metro → Train → Walk (any combination)
  - Time-based availability (weekday/weekend service filtering)
  - Frequency-based services (metro headway calculation)
  - User preferences for ranking (fewer transfers, less walking, mode preferences)
  - Clear Bus/Metro/Train distinction with agency labels

Algorithm: Modified RAPTOR (Round-based Public Transit Optimized Router)
  Round 0: Walk from origin → origin stops → board trips
  Round 1+: Allow transfers at intermediate stops → board new trips
  Continue until destination reached or max transfers exceeded.

Scoring: Weighted combination of:
  - Total duration
  - Number of transfers
  - Total walking time
  - Mode preference matching
"""

from datetime import date, datetime, timedelta
from dataclasses import dataclass, field
import heapq

from .schemas import (
    RoutePreferences,
    RouteStep,
    RouteResult,
    RoutingRequest,
    RoutingResponse,
)
from .transit_repository import TransitRepository


# ──────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────

WALKING_SPEED_KMPH = 5.0
TRANSFER_WALK_SPEED_KMPH = 4.0
MAX_TRANSFER_DISTANCE_KM = 0.5

# GTFS route_type → (Mode Name, Display Label, Agency)
# Maps to the standard GTFS route_type values
GTFS_ROUTE_MODES = {
    0: ("Tram", "Tram", ""),
    1: ("Metro", "CMRL Metro", "CMRL"),
    2: ("Train", "SR Suburban Train", "SR"),
    3: ("Bus", "MTC Bus", "MTC"),
    4: ("Ferry", "Ferry", ""),
}

# Mode-specific display names for the routing engine
MODE_DISPLAY = {
    "Bus": {"icon": "🚌", "color": "#27AE60", "agency": "MTC"},
    "Metro": {"icon": "🚇", "color": "#2E86C1", "agency": "CMRL"},
    "Train": {"icon": "🚂", "color": "#8E44AD", "agency": "SR"},
    "Tram": {"icon": "🚊", "color": "#E67E22", "agency": ""},
    "Ferry": {"icon": "⛴️", "color": "#3498DB", "agency": ""},
    "Walk": {"icon": "🚶", "color": "#95A5A6", "agency": ""},
}


# ──────────────────────────────────────────────
# Internal data structures
# ──────────────────────────────────────────────

@dataclass
class JourneyLabel:
    """Represents a partial journey state during routing."""

    arrival_time: datetime
    stop_id: str
    stop_name: str

    steps: list = field(default_factory=list)
    trip_ids: list = field(default_factory=list)
    transfer_count: int = 0

    def __lt__(self, other):
        return self.arrival_time < other.arrival_time


# ──────────────────────────────────────────────
# Main router class
# ──────────────────────────────────────────────

class MultiModalRouter:
    """
    Multi-modal transit router with preference-based ranking.

    Usage:
        router = MultiModalRouter(repository)
        response = await router.find_all_routes(request)
    """

    def __init__(self, repository: TransitRepository):
        self.repository = repository

    def _get_mode_info(self, route_type: int | None) -> dict:
        """
        Get mode display info from GTFS route_type.
        Returns {mode, mode_label, agency, icon, color}.
        """
        if route_type is None:
            return {"mode": "Unknown", "mode_label": "Unknown", "agency": "", "icon": "🚌", "color": "#95A5A6"}

        mode_name, display_label, agency = GTFS_ROUTE_MODES.get(
            route_type, ("Unknown", "Unknown", "")
        )
        icon = MODE_DISPLAY.get(mode_name, {}).get("icon", "🚌")
        color = MODE_DISPLAY.get(mode_name, {}).get("color", "#95A5A6")

        return {
            "mode": mode_name,
            "mode_label": display_label,
            "agency": agency,
            "icon": icon,
            "color": color,
        }

    def _format_mode_label(
        self,
        route_name: str | None,
        route_type: int | None,
        agency: str,
    ) -> str:
        """
        Format a friendly mode label.
        Examples:
          - "MTC Bus 51C"
          - "CMRL Metro Blue Line"
          - "SR Suburban Train"
          - "MRTS"
        """
        mode_info = self._get_mode_info(route_type)
        mode_name = mode_info["mode"]

        if not route_name:
            return f"{agency} {mode_name}" if agency else mode_name

        # Check if route_name already contains mode info
        route_upper = route_name.upper()

        # Metro routes: CMRL_1, CMRL_2, CMRL_3
        if route_upper.startswith("CMRL"):
            if "BLUE" in route_upper:
                return f"CMRL Metro Blue Line ({route_name})"
            elif "GREEN" in route_upper:
                return f"CMRL Metro Green Line ({route_name})"
            elif "INTER" in route_upper:
                return f"CMRL Metro Inter-Corridor ({route_name})"
            return f"CMRL Metro ({route_name})"

        # Train routes: TRAIN_MASAJJ, TRAIN_MASGPD, etc.
        if route_upper.startswith("TRAIN"):
            if "MRTS" in route_upper:
                return f"MRTS ({route_name})"
            elif "MAS-GPD" in route_upper or "NORTH" in route_upper:
                return f"SR Suburban North Line ({route_name})"
            elif "CGL" in route_upper or "SOUTH" in route_upper:
                return f"SR Suburban South Line ({route_name})"
            elif "AJJ" in route_upper or "WEST" in route_upper:
                return f"SR Suburban West Line ({route_name})"
            return f"SR Suburban ({route_name})"

        # Bus routes: 51C, 29A, etc.
        if agency == "MTC" or (route_type == 3):
            return f"MTC Bus {route_name}"

        # Default
        if agency:
            return f"{agency} {mode_name} {route_name}"
        return f"{mode_name} {route_name}"

    async def find_all_routes(
        self,
        request: RoutingRequest,
    ) -> RoutingResponse:
        """
        Find all possible multi-modal routes from origin to destination.
        Returns routes ranked by user preferences.
        """

        prefs = request.preferences

        # ── Step 1: Find origin stops ──
        origin_stops = await self.repository.get_nearby_stops(
            latitude=request.origin.latitude,
            longitude=request.origin.longitude,
            radius_km=request.max_walking_distance_km,
            limit=30,
        )

        # ── Step 2: Find destination stops ──
        dest_stops = await self.repository.get_nearby_stops(
            latitude=request.destination.latitude,
            longitude=request.destination.longitude,
            radius_km=request.max_walking_distance_km,
            limit=30,
        )

        if not origin_stops or not dest_stops:
            return RoutingResponse(total_routes=0, routes=[])

        dest_stop_ids = {row["stop_id"] for row in dest_stops}

        # ── Step 3: Get active services for this date ──
        service_ids = await self.repository.get_active_service_ids(
            request.departure_time.date()
        )

        if not service_ids:
            return RoutingResponse(total_routes=0, routes=[])

        # ── Step 4: Run multi-round search ──
        found_labels = await self._multi_round_search(
            origin_stops=origin_stops,
            dest_stop_ids=dest_stop_ids,
            dest_stops=dest_stops,
            departure_time=request.departure_time,
            service_ids=service_ids,
            max_walking_distance_km=request.max_walking_distance_km,
            max_transfers=request.max_transfers,
        )

        # ── Step 5: Build RouteResult objects ──
        route_results = []
        for label in found_labels:
            total_duration = (
                label.arrival_time - request.departure_time
            ).total_seconds() / 60

            # Calculate walking and transit breakdowns
            total_walking = sum(
                step.duration_minutes or 0
                for step in label.steps
                if step.mode == "Walk"
            )
            total_transit = sum(
                step.duration_minutes or 0
                for step in label.steps
                if step.mode != "Walk"
            )

            modes_used = list({
                step.mode
                for step in label.steps
                if step.mode != "Walk"
            })

            # ── Apply hard constraint: max walking time ──
            if (
                prefs.max_walking_minutes is not None
                and total_walking > prefs.max_walking_minutes
            ):
                continue

            # ── Apply hard constraint: avoid_modes ──
            if prefs.avoid_modes:
                route_modes = set(modes_used)
                avoided_set = set(prefs.avoid_modes)
                # Exclude if route uses ONLY avoided modes
                if route_modes and route_modes.issubset(avoided_set):
                    continue

            route_results.append(RouteResult(
                total_duration_minutes=round(total_duration, 1),
                departure_time=request.departure_time,
                arrival_time=label.arrival_time,
                transfers=label.transfer_count,
                steps=label.steps,
                modes_used=modes_used,
                total_walking_minutes=round(total_walking, 1),
                total_transit_minutes=round(total_transit, 1),
            ))

        # ── Step 6: Score and rank ──
        route_results = self._score_and_rank(route_results, prefs)

        # ── Step 7: Limit results ──
        route_results = route_results[:request.max_results]

        return RoutingResponse(
            total_routes=len(route_results),
            routes=route_results,
        )

    # ──────────────────────────────────────────
    # Core routing algorithm
    # ──────────────────────────────────────────

    async def _multi_round_search(
        self,
        origin_stops: list,
        dest_stop_ids: set,
        dest_stops: list,
        departure_time: datetime,
        service_ids: list[str],
        max_walking_distance_km: float,
        max_transfers: int,
    ) -> list[JourneyLabel]:
        """
        Modified RAPTOR multi-round search.
        """

        all_found_routes: list[JourneyLabel] = []

        queue: list[tuple] = []
        best_arrival: dict[tuple, datetime] = {}

        # ── Initialize: Walk from user location to each origin stop ──
        for stop in origin_stops:
            stop_id = stop["stop_id"]
            walk_dist = float(stop["distance_km"])
            walk_min = (walk_dist / WALKING_SPEED_KMPH) * 60
            walk_arrival = departure_time + timedelta(minutes=walk_min)

            walk_step = RouteStep(
                mode="Walk",
                mode_label="Walk",
                agency="",
                instruction=f"Walk to {stop['stop_name']}",
                from_name="Your Location",
                to_name=stop["stop_name"],
                departure_time=departure_time,
                arrival_time=walk_arrival,
                duration_minutes=round(walk_min, 1),
                distance_km=round(walk_dist, 2),
            )

            label = JourneyLabel(
                arrival_time=walk_arrival,
                stop_id=stop_id,
                stop_name=stop["stop_name"],
                steps=[walk_step],
                trip_ids=[],
                transfer_count=0,
            )

            state_key = (stop_id, 0)
            best_arrival[state_key] = walk_arrival
            heapq.heappush(queue, (walk_arrival, stop_id, label))

        # ── Main search loop ──
        processed_states: set = set()
        max_iterations = 5000

        for _ in range(max_iterations):
            if not queue:
                break

            current_time, current_stop_id, current_label = heapq.heappop(queue)

            state_key = (
                current_stop_id,
                current_label.transfer_count,
                len(current_label.steps),
            )
            if state_key in processed_states:
                continue
            processed_states.add(state_key)

            # ── Check: reached a destination stop? ──
            if current_stop_id in dest_stop_ids:
                route = self._complete_route(
                    current_label=current_label,
                    dest_stops=dest_stops,
                    departure_time=departure_time,
                )
                if route:
                    all_found_routes.append(route)

            # ── Don't exceed max transfers ──
            if current_label.transfer_count > max_transfers:
                continue

            # ── Explore trips from current stop ──
            await self._explore_trips(
                current_label=current_label,
                departure_time=departure_time,
                service_ids=service_ids,
                queue=queue,
                best_arrival=best_arrival,
            )

            # ── Explore transfers to nearby stops ──
            if current_label.transfer_count < max_transfers:
                await self._explore_transfers(
                    current_label=current_label,
                    queue=queue,
                    best_arrival=best_arrival,
                )

        return all_found_routes

    async def _explore_trips(
        self,
        current_label: JourneyLabel,
        departure_time: datetime,
        service_ids: list[str],
        queue: list,
        best_arrival: dict,
    ):
        """
        Find all trips departing from current stop after current time.
        Handles both schedule-based and frequency-based services.
        """

        trips = await self.repository.get_trips_from_stop(
            stop_id=current_label.stop_id,
            departure_after=current_label.arrival_time,
            service_ids=service_ids,
            limit=100,
        )

        if not trips:
            return

        # ── Check which trips are frequency-based ──
        trip_ids = [trip["trip_id"] for trip in trips]
        freq_map = await self.repository.is_trip_frequency_based(trip_ids)

        # ── Get frequency data for frequency-based trips ──
        freq_trip_ids = [tid for tid, is_freq in freq_map.items() if is_freq]
        freq_data = {}  # trip_id -> list of frequency records

        if freq_trip_ids:
            freq_records = await self.repository.get_frequencies_for_trips(
                freq_trip_ids
            )
            for rec in freq_records:
                tid = rec["trip_id"]
                if tid not in freq_data:
                    freq_data[tid] = []
                freq_data[tid].append(rec)

        # ── Process each trip ──
        for trip in trips:
            trip_id = trip["trip_id"]

            if trip_id in current_label.trip_ids:
                continue

            is_freq = freq_map.get(trip_id, False)

            # Get downstream stops
            downstream = await self.repository.get_trip_stops_after(
                trip_id=trip_id,
                after_stop_id=current_label.stop_id,
            )

            if not downstream:
                continue

            # ── Calculate actual departure time ──
            if is_freq and trip_id in freq_data:
                # Frequency-based service: calculate next departure using headway
                freq_info = await self._get_frequency_departure(
                    trip_id=trip_id,
                    after_time=current_label.arrival_time,
                    reference_date=departure_time.date(),
                    freq_records=freq_data[trip_id],
                )

                if freq_info is None:
                    continue  # No more service in this frequency window

                actual_departure = freq_info["next_departure"]
                wait_minutes = freq_info["wait_seconds"] / 60.0
                headway_secs = freq_info["headway_seconds"]
                freq_window = (
                    f"{freq_info['window_start']}-{freq_info['window_end']}"
                )
            else:
                # Schedule-based service: use stop_times departure
                actual_departure = self._parse_gtfs_time(
                    trip["departure_time"],
                    departure_time.date(),
                )
                wait_minutes = None
                headway_secs = None
                freq_window = None

            # ── Get mode info ──
            route_type = trip.get("route_type")
            mode_info = self._get_mode_info(route_type)
            mode_name = mode_info["mode"]
            agency = mode_info["agency"]

            route_name = (
                trip.get("route_short_name")
                or trip.get("route_long_name")
                or trip_id
            )

            # Format friendly mode label
            mode_label = self._format_mode_label(route_name, route_type, agency)

            # Track cumulative time offset from departure
            # We need to adjust arrival times for frequency-based services
            # based on the actual departure vs. the scheduled one
            for ds in downstream:
                ds_stop_id = ds["stop_id"]

                # Scheduled arrival at this downstream stop
                scheduled_arr = self._parse_gtfs_time(
                    ds["arrival_time"],
                    departure_time.date(),
                )

                if is_freq and trip_id in freq_data:
                    # For frequency-based, calculate actual arrival
                    # by adding the travel duration from the first stop
                    scheduled_dep_at_board = self._parse_gtfs_time(
                        trip["departure_time"],
                        departure_time.date(),
                    )
                    travel_duration = scheduled_arr - scheduled_dep_at_board

                    # Handle overnight trips
                    if travel_duration.total_seconds() < 0:
                        travel_duration += timedelta(days=1)

                    actual_arrival = actual_departure + travel_duration
                else:
                    actual_arrival = scheduled_arr

                # Sanity check
                if actual_arrival <= actual_departure:
                    continue

                # Build transit step
                transit_step = RouteStep(
                    mode=mode_name,
                    mode_label=mode_label,
                    agency=agency,
                    instruction=(
                        f"Take {mode_label} "
                        f"from {current_label.stop_name} "
                        f"to {ds['stop_name']}"
                    ),
                    from_name=current_label.stop_name,
                    to_name=ds["stop_name"],
                    departure_time=actual_departure,
                    arrival_time=actual_arrival,
                    duration_minutes=round(
                        (actual_arrival - actual_departure).total_seconds() / 60, 1
                    ),
                    route_name=str(route_name),
                    route_type=route_type,
                    trip_id=trip_id,
                    service_id=trip.get("service_id"),
                    board_stop=current_label.stop_name,
                    alight_stop=ds["stop_name"],
                    is_frequency_based=is_freq,
                    headway_seconds=headway_secs,
                    frequency_window=freq_window,
                    wait_time_minutes=round(wait_minutes, 1) if wait_minutes else None,
                )

                new_label = JourneyLabel(
                    arrival_time=actual_arrival,
                    stop_id=ds_stop_id,
                    stop_name=ds["stop_name"],
                    steps=current_label.steps + [transit_step],
                    trip_ids=current_label.trip_ids + [trip_id],
                    transfer_count=current_label.transfer_count,
                )

                arrival_key = (ds_stop_id, new_label.transfer_count)
                if (
                    arrival_key not in best_arrival
                    or actual_arrival < best_arrival[arrival_key]
                ):
                    best_arrival[arrival_key] = actual_arrival
                    heapq.heappush(
                        queue,
                        (actual_arrival, ds_stop_id, new_label),
                    )

    async def _explore_transfers(
        self,
        current_label: JourneyLabel,
        queue: list,
        best_arrival: dict,
    ):
        """
        Find nearby stops and create transfer labels.
        """

        nearby = await self.repository.get_nearby_stops_by_id(
            stop_id=current_label.stop_id,
            radius_km=MAX_TRANSFER_DISTANCE_KM,
        )

        for n in nearby:
            if n["stop_id"] == current_label.stop_id:
                continue

            transfer_dist = float(n.get("distance_km", 0.3))
            transfer_min = (transfer_dist / TRANSFER_WALK_SPEED_KMPH) * 60
            transfer_arrival = current_label.arrival_time + timedelta(
                minutes=transfer_min
            )

            transfer_step = RouteStep(
                mode="Walk",
                mode_label="Walk",
                agency="",
                instruction=f"Transfer to {n['stop_name']}",
                from_name=current_label.stop_name,
                to_name=n["stop_name"],
                departure_time=current_label.arrival_time,
                arrival_time=transfer_arrival,
                duration_minutes=round(transfer_min, 1),
                distance_km=round(transfer_dist, 2),
            )

            new_label = JourneyLabel(
                arrival_time=transfer_arrival,
                stop_id=n["stop_id"],
                stop_name=n["stop_name"],
                steps=current_label.steps + [transfer_step],
                trip_ids=current_label.trip_ids,
                transfer_count=current_label.transfer_count + 1,
            )

            arrival_key = (n["stop_id"], new_label.transfer_count)
            if (
                arrival_key not in best_arrival
                or transfer_arrival < best_arrival[arrival_key]
            ):
                best_arrival[arrival_key] = transfer_arrival
                heapq.heappush(
                    queue,
                    (transfer_arrival, n["stop_id"], new_label),
                )

    def _complete_route(
        self,
        current_label: JourneyLabel,
        dest_stops: list,
        departure_time: datetime,
    ) -> JourneyLabel | None:
        """
        Add final walking step from transit stop to user's destination.
        """

        dest_stop = next(
            (s for s in dest_stops if s["stop_id"] == current_label.stop_id),
            None,
        )
        if not dest_stop:
            return None

        final_walk_dist = float(dest_stop["distance_km"])
        final_walk_min = (final_walk_dist / WALKING_SPEED_KMPH) * 60
        final_walk_arrival = current_label.arrival_time + timedelta(
            minutes=final_walk_min
        )

        final_step = RouteStep(
            mode="Walk",
            mode_label="Walk",
            agency="",
            instruction="Walk to destination",
            from_name=current_label.stop_name,
            to_name="Your Destination",
            departure_time=current_label.arrival_time,
            arrival_time=final_walk_arrival,
            duration_minutes=round(final_walk_min, 1),
            distance_km=round(final_walk_dist, 2),
        )

        return JourneyLabel(
            arrival_time=final_walk_arrival,
            stop_id=current_label.stop_id,
            stop_name=current_label.stop_name,
            steps=current_label.steps + [final_step],
            trip_ids=current_label.trip_ids,
            transfer_count=current_label.transfer_count,
        )

    # ──────────────────────────────────────────
    # Frequency-based service handling
    # ──────────────────────────────────────────

    @staticmethod
    def _get_frequency_departure_sync(
        trip_id: str,
        after_time: datetime,
        reference_date: date,
        freq_records: list,
    ) -> dict | None:
        """
        Calculate next departure for a frequency-based trip.
        Pure function (no DB calls) for efficiency.

        Logic:
          1. Find the frequency window containing after_time
          2. Calculate next departure using headway
          3. If after_time is before all windows, first departure = window start
          4. If after_time is after all windows, return None
        """

        current_secs = (
            after_time.hour * 3600
            + after_time.minute * 60
            + after_time.second
        )

        for row in freq_records:
            start = _interval_to_seconds(row["start_time"])
            end = _interval_to_seconds(row["end_time"])
            headway = row["headway_secs"]

            # Before this window: first train is at window start
            if current_secs < start:
                wait = start - current_secs
                return {
                    "next_departure": _seconds_to_datetime(
                        start, reference_date
                    ),
                    "headway_seconds": headway,
                    "window_start": str(row["start_time"]),
                    "window_end": str(row["end_time"]),
                    "wait_seconds": wait,
                }

            # Inside this window: calculate next departure
            if start <= current_secs <= end:
                time_in_window = current_secs - start
                departures_elapsed = time_in_window // headway
                next_dep_secs = start + (departures_elapsed + 1) * headway

                if next_dep_secs <= end:
                    wait = next_dep_secs - current_secs
                    return {
                        "next_departure": _seconds_to_datetime(
                            next_dep_secs, reference_date
                        ),
                        "headway_seconds": headway,
                        "window_start": str(row["start_time"]),
                        "window_end": str(row["end_time"]),
                        "wait_seconds": wait,
                    }

        # After all windows: no more service
        return None

    async def _get_frequency_departure(
        self,
        trip_id: str,
        after_time: datetime,
        reference_date: date,
        freq_records: list,
    ) -> dict | None:
        """
        Wrapper that calls the sync version.
        Could be extended with DB fallback if needed.
        """
        return self._get_frequency_departure_sync(
            trip_id, after_time, reference_date, freq_records
        )

    # ──────────────────────────────────────────
    # Preference-based scoring and ranking
    # ──────────────────────────────────────────

    def _score_and_rank(
        self,
        routes: list[RouteResult],
        prefs: RoutePreferences,
    ) -> list[RouteResult]:
        """
        Score each route based on user preferences and sort by final score.
        Lower score = better route.
        """

        if not routes:
            return routes

        # ── Collect raw values for normalization ──
        durations = [r.total_duration_minutes for r in routes]
        transfers = [r.transfers for r in routes]
        walking = [r.total_walking_minutes for r in routes]

        min_dur, max_dur = min(durations), max(durations)
        min_trans, max_trans = min(transfers), max(transfers)
        min_walk, max_walk = min(walking), max(walking)

        for route in routes:

            # ── Normalize to 0.0 (best) - 1.0 (worst) ──

            # Duration score
            if max_dur > min_dur:
                score_dur = (route.total_duration_minutes - min_dur) / (max_dur - min_dur)
            else:
                score_dur = 0.0

            # Transfer score
            if max_trans > min_trans:
                score_trans = (route.transfers - min_trans) / (max_trans - min_trans)
            else:
                score_trans = 0.0

            # Walking score
            if max_walk > min_walk:
                score_walk = (route.total_walking_minutes - min_walk) / (max_walk - min_walk)
            else:
                score_walk = 0.0

            # Mode preference score
            score_mode = self._mode_preference_score(
                route.modes_used, prefs
            )

            # ── Weighted combination ──
            final_score = (
                prefs.weight_duration * score_dur
                + prefs.weight_transfers * score_trans
                + prefs.weight_walking * score_walk
                + prefs.weight_mode_preference * score_mode
            )

            # ── Additional penalties ──

            # Bonus for fewer transfers if preferred
            if prefs.prefer_fewer_transfers:
                final_score += 0.1 * route.transfers

            # Bonus for less walking if preferred
            if prefs.prefer_less_walking:
                final_score += 0.05 * route.total_walking_minutes

            # Store scores in result
            route.score_duration = round(score_dur, 3)
            route.score_transfers = round(score_trans, 3)
            route.score_walking = round(score_walk, 3)
            route.score_mode_preference = round(score_mode, 3)
            route.final_score = round(final_score, 3)

        # ── Sort by final score (lower = better) ──
        routes.sort(key=lambda r: r.final_score or 0)

        return routes

    @staticmethod
    def _mode_preference_score(
        modes_used: list[str], prefs: RoutePreferences
    ) -> float:
        """
        Score how well a route matches mode preferences.
        Returns 0.0 (perfect match) to 1.0 (no match / penalized).
        """

        if not prefs.prefer_modes and not prefs.avoid_modes:
            return 0.0  # No preference = neutral

        used_set = set(modes_used)

        score = 0.0

        # Check preferred modes: routes using preferred modes get LOWER score
        if prefs.prefer_modes:
            preferred_set = set(prefs.prefer_modes)
            matching = used_set & preferred_set
            if used_set:
                # Ratio of preferred modes used
                match_ratio = len(matching) / len(used_set)
                score += (1.0 - match_ratio) * 0.5  # 0.0 to 0.5
            else:
                score += 0.5  # No transit = neutral

        # Check avoided modes: routes using avoided modes get HIGHER score
        if prefs.avoid_modes:
            avoided_set = set(prefs.avoid_modes)
            avoided_used = used_set & avoided_set
            if used_set and avoided_set:
                avoid_ratio = len(avoided_used) / len(used_set)
                score += avoid_ratio * 0.5  # 0.0 to 0.5

        return min(1.0, score)

    # ──────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────

    @staticmethod
    def _parse_gtfs_time(time_str, reference_date: date) -> datetime:
        """
        Parse GTFS time string (may be >24:00:00) into datetime.
        """

        parts = str(time_str).split(":")
        hours = int(parts[0])
        minutes = int(parts[1]) if len(parts) > 1 else 0
        seconds = int(float(parts[2])) if len(parts) > 2 else 0

        day_offset = 0
        if hours >= 24:
            day_offset = hours // 24
            hours = hours % 24

        base = datetime.combine(
            reference_date,
            datetime.min.time().replace(
                hour=hours,
                minute=minutes,
                second=seconds,
            ),
        )

        return base + timedelta(days=day_offset)


# ──────────────────────────────────────────────
# Module-level helper functions
# ──────────────────────────────────────────────

def _interval_to_seconds(interval_val) -> int:
    """Convert INTERVAL or HH:MM:SS string to total seconds."""
    if interval_val is None:
        return 0

    s = str(interval_val).strip()
    parts = s.split(":")

    if len(parts) == 3:
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = int(float(parts[2]))
        return hours * 3600 + minutes * 60 + seconds

    return 0


def _seconds_to_datetime(total_seconds: int, reference_date: date) -> datetime:
    """Convert total seconds since midnight to datetime (handles >24:00)."""
    day_offset = 0
    if total_seconds >= 86400:
        day_offset = total_seconds // 86400
        total_seconds = total_seconds % 86400

    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60

    return datetime.combine(
        reference_date,
        datetime.min.time().replace(
            hour=hours,
            minute=minutes,
            second=seconds,
        ),
    ) + timedelta(days=day_offset)
