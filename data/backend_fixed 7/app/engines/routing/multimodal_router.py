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
from ..combination.algorithms import haversine_distance_km


# ──────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────

WALKING_SPEED_KMPH = 5.0
TRANSFER_WALK_SPEED_KMPH = 4.0
MAX_TRANSFER_DISTANCE_KM = 0.5
# Rough city-traffic average, for estimating an auto/taxi leg's duration
# once it's past MAX_COMFORTABLE_WALK_KM — walking-pace math would wildly
# overstate how long that stretch actually takes by road.
AUTO_SPEED_KMPH = 20.0

# A real bus almost never shows up exactly on the GTFS-scheduled minute —
# traffic, driver behavior, etc. Trusting the schedule literally (a
# computed gap of, say, 1-2 minutes) reads as far more reliable than city
# bus service actually is. Metro/train run on dedicated track/right-of-way
# and are close enough to on-time that their own schedule is trustworthy,
# so this floor applies to bus only (GTFS route_type 3).
MIN_BUS_WAIT_MINUTES = 15.0

# Metro runs frequently enough (and predictably enough, on dedicated
# track) that a flat assumed wait is simpler and just as realistic as
# computing it from the exact headway window — used in place of the
# actual computed frequency-based wait below.
METRO_WAIT_MINUTES = 5.0

# Beyond this, a "walk to the stop" leg reads as an auto/taxi leg instead —
# past about 15 minutes on foot, that's genuinely how people actually cover
# that gap, not by walking it.
MAX_COMFORTABLE_WALK_KM = 1.2

# If nothing is within the caller's requested walking radius at all (e.g. a
# campus interior or a beach with no stop nearby), retry once at this much
# wider radius purely to find *some* usable stop — rather than giving up
# with "no route" when the honest answer is "public transit gets you to
# within N km, then take an auto the rest of the way". Matches the
# schema's own upper bound on max_walking_distance_km, so it's never
# narrower than a caller could have asked for directly.
FALLBACK_STOP_SEARCH_RADIUS_KM = 5.0

# Blended cross-city transit speed used ONLY to bias which frontier stop
# the search explores next — never to compute an actual reported time.
# Without this, the search is plain earliest-arrival Dijkstra: it expands
# strictly in order of elapsed time, with zero notion of which direction
# the destination is in. At a busy interchange with 40+ onward routes,
# that means dozens of stops in totally unrelated parts of the city get
# explored before a stop one transfer closer to the actual destination
# does, just because they happen to have an earlier bus. Verified
# directly: Potheri -> Sriperumbudur (real, ~2-transfer bus journey, stop
# confirmed 220m from the destination) needed 6000+ search iterations
# (34s+) to complete under plain earliest-arrival ordering, and never
# completed at all within the normal 2000-iteration/~12s budget — the
# search just never got there. Nudging the priority queue toward stops
# that are actually closer to the destination (while keeping every
# stored arrival_time exact and real) fixes that without touching what
# routes are found or their reported times, only the order they're
# discovered in.
HEURISTIC_SPEED_KMPH = 25.0

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
        # Nothing within comfortable walking distance (a campus interior,
        # a stretch of coastline, ...) doesn't mean no transit exists at
        # all — widen the search just to locate the nearest usable stop.
        # _complete_route / the origin-init step relabel this leg as
        # Auto/Taxi once it's past MAX_COMFORTABLE_WALK_KM, so the caller
        # sees an honest "get to X, then take an auto" instead of nothing.
        if not origin_stops:
            origin_stops = await self.repository.get_nearby_stops(
                latitude=request.origin.latitude,
                longitude=request.origin.longitude,
                radius_km=FALLBACK_STOP_SEARCH_RADIUS_KM,
                limit=20,
            )

        # ── Step 2: Find destination stops ──
        dest_stops = await self.repository.get_nearby_stops(
            latitude=request.destination.latitude,
            longitude=request.destination.longitude,
            radius_km=request.max_walking_distance_km,
            limit=30,
        )
        if not dest_stops:
            dest_stops = await self.repository.get_nearby_stops(
                latitude=request.destination.latitude,
                longitude=request.destination.longitude,
                radius_km=FALLBACK_STOP_SEARCH_RADIUS_KM,
                limit=20,
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
            max_results=request.max_results,
            dest_lat=request.destination.latitude,
            dest_lon=request.destination.longitude,
        )

        # ── Step 4b: give Metro/Train their own shot ──
        # The main search above is a greedy earliest-arrival walk over the
        # whole graph. Bus service in this dataset is far more frequent
        # than train/metro, so a bus branch generates many more competing
        # queue entries — the train/metro branch can end up never
        # completing at all within budget, not merely ranked lower, even
        # when a real direct train exists (verified directly: a route with
        # zero train/metro options among 30 raw bus-only candidates, for a
        # destination just past a real, scheduled, same-hour train stop).
        # Re-run a small, cheap, separate search seeded ONLY from nearby
        # train/metro stops so those modes always get evaluated on their
        # own merits instead of just losing that race silently.
        already_has_rail = any(
            step.mode in ("Metro", "Train")
            for label in found_labels
            for step in label.steps
        )
        if not already_has_rail:
            rail_stop_ids = await self.repository.filter_stops_by_route_types(
                [s["stop_id"] for s in origin_stops], [1, 2]
            )
            rail_origin_stops = [s for s in origin_stops if s["stop_id"] in rail_stop_ids]
            if rail_origin_stops:
                rail_labels = await self._multi_round_search(
                    origin_stops=rail_origin_stops,
                    dest_stop_ids=dest_stop_ids,
                    dest_stops=dest_stops,
                    departure_time=request.departure_time,
                    service_ids=service_ids,
                    max_walking_distance_km=request.max_walking_distance_km,
                    max_transfers=request.max_transfers,
                    max_results=request.max_results,
                    dest_lat=request.destination.latitude,
                    dest_lon=request.destination.longitude,
                    max_iterations_override=800,
                    target_route_count_override=3,
                    always_add_partial=True,
                )
                found_labels = found_labels + rail_labels

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
            # Auto/Taxi legs are neither walking nor transit — they're the
            # "last mile" gap transit itself doesn't cover.
            total_transit = sum(
                step.duration_minutes or 0
                for step in label.steps
                if step.mode not in ("Walk", "Auto")
            )

            modes_used = list({
                step.mode
                for step in label.steps
                if step.mode != "Walk"
            })

            total_wait = sum(step.wait_time_minutes or 0 for step in label.steps)

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
                total_wait_minutes=round(total_wait, 1),
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
        max_results: int = 10,
        dest_lat: float | None = None,
        dest_lon: float | None = None,
        max_iterations_override: int | None = None,
        target_route_count_override: int | None = None,
        track_partial_override: bool | None = None,
        always_add_partial: bool = False,
    ) -> list[JourneyLabel]:
        """
        Modified RAPTOR multi-round search. The *_override params let a
        caller run a smaller, cheaper supplementary pass (e.g. a
        train/metro-only search seeded from a restricted origin_stops) on
        top of the normal full search, without touching that search's own
        tuned budget.
        """

        all_found_routes: list[JourneyLabel] = []

        # Best point actually reached, in case the search never makes it to
        # any dest_stop at all within budget — e.g. a real path exists but
        # needs more transfers/exploration than is practical to search for
        # interactively, or the destination genuinely has no nearby stop
        # even after the caller-facing widened search. Tracked continuously
        # (not just as a last resort) so there's always something to fall
        # back to rather than a bare "no routes" when transit gets you
        # most of the way there.
        best_partial_label: JourneyLabel | None = None
        best_partial_dist_km: float = float("inf")
        track_partial = (
            track_partial_override
            if track_partial_override is not None
            else dest_lat is not None and dest_lon is not None
        )

        queue: list[tuple] = []
        best_arrival: dict[tuple, datetime] = {}

        # ── Initialize: Walk from user location to each origin stop ──
        for stop in origin_stops:
            stop_id = stop["stop_id"]
            walk_dist = float(stop["distance_km"])
            too_far_to_walk = walk_dist > MAX_COMFORTABLE_WALK_KM
            walk_min = (
                walk_dist / (AUTO_SPEED_KMPH if too_far_to_walk else WALKING_SPEED_KMPH)
            ) * 60
            walk_arrival = departure_time + timedelta(minutes=walk_min)

            walk_step = RouteStep(
                mode="Auto" if too_far_to_walk else "Walk",
                mode_label="Auto/Taxi" if too_far_to_walk else "Walk",
                agency="",
                instruction=(
                    f"Too far to walk ({walk_dist:.1f} km) — take an auto/taxi to {stop['stop_name']}"
                    if too_far_to_walk
                    else f"Walk to {stop['stop_name']}"
                ),
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
            priority = walk_arrival + self._heuristic_delta(
                stop.get("stop_lat"), stop.get("stop_lon"), dest_lat, dest_lon
            )
            heapq.heappush(queue, (priority, stop_id, label))

        # ── Main search loop ──
        processed_states: set = set()
        # Earliest-arrival label reached per stop — kept alongside
        # processed_states so that if the search never reaches an actual
        # dest_stop, there's still something concrete (the real steps
        # taken) to build a partial-journey fallback from afterward.
        reached_labels: dict[str, JourneyLabel] = {}
        # A hard ceiling on exploration regardless of how many routes have
        # already been found — nothing below ever broke out once the
        # destination was reached, it just kept exploring the rest of the
        # network looking for more alternatives. That made every request
        # run the full 5000-iteration budget (each iteration can be several
        # DB round trips), 30-45+ seconds even for short, simple trips.
        max_iterations = max_iterations_override if max_iterations_override is not None else 2000
        # Once there's a healthy surplus of candidates to rank and trim
        # down to max_results from, stop — no need to keep exploring the
        # rest of the network for marginal extra alternatives.
        target_route_count = (
            target_route_count_override
            if target_route_count_override is not None
            else max(max_results * 3, 15)
        )

        for _ in range(max_iterations):
            if not queue or len(all_found_routes) >= target_route_count:
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
            reached_labels.setdefault(current_stop_id, current_label)

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
                dest_lat=dest_lat,
                dest_lon=dest_lon,
            )

            # ── Explore transfers to nearby stops ──
            if current_label.transfer_count < max_transfers:
                await self._explore_transfers(
                    current_label=current_label,
                    queue=queue,
                    best_arrival=best_arrival,
                    dest_lat=dest_lat,
                    dest_lon=dest_lon,
                )

        # No complete route to an actual dest_stop was found within
        # budget — offer the closest point transit genuinely got to
        # instead of a bare "no routes", same spirit as the widened-radius
        # fallback above but for when the gap is in the search itself
        # rather than in stop coverage.
        #
        # `always_add_partial` additionally surfaces this even when other
        # completions WERE found — needed for the rail-only supplementary
        # search: a destination can have bus stops within the normal
        # search radius (so dest_stop_ids is never empty and the search
        # completes some bus-heavy route) while the nearest *rail* stop
        # sits just outside it. Without this, that rail-only pass's own
        # best result — real train ride + a short last-mile hop — never
        # gets a chance to compete on the merits, because the ordinary
        # "only when nothing completed" fallback never triggers (verified:
        # Guindy National Park has bus stops ~200-300m away, so a genuine
        # Potheri->Guindy train + short auto never surfaced even though
        # it's a faster, more direct journey than the bus-only routes
        # found).
        if (not all_found_routes or always_add_partial) and track_partial and reached_labels:
            stop_ids = list(reached_labels.keys())
            coords = await self.repository.get_stop_coords(stop_ids)

            # Rank candidates by estimated total arrival time (label's own
            # arrival + a last-mile leg over the remaining distance), not
            # by remaining distance alone. Picking purely on distance
            # favored a stop reached only via a long, convoluted path
            # (several transfers, much more elapsed time) just because it
            # happened to land geometrically closer to the destination
            # than a stop reached directly and quickly — e.g. a 3-transfer
            # detour ending 1.1km from the destination beat a direct
            # 1-hop train ride ending 2.7km away, even though the direct
            # ride's total door-to-door time was far shorter once the
            # last-mile leg is added on both sides.
            best_label: JourneyLabel | None = None
            best_dist_km = float("inf")
            best_eta: datetime | None = None
            for stop_id, label in reached_labels.items():
                coord = coords.get(stop_id)
                if not coord:
                    continue
                dist = haversine_distance_km(coord[0], coord[1], dest_lat, dest_lon)
                too_far_to_walk = dist > MAX_COMFORTABLE_WALK_KM
                last_mile_min = (
                    dist / (AUTO_SPEED_KMPH if too_far_to_walk else WALKING_SPEED_KMPH)
                ) * 60
                eta = label.arrival_time + timedelta(minutes=last_mile_min)
                if best_eta is None or eta < best_eta:
                    best_eta = eta
                    best_dist_km = dist
                    best_label = label

            # No separate distance cap here — best_label was already chosen
            # by estimated total door-to-door ETA (real transit ride +
            # realistic last-mile leg), so a genuinely far-off candidate
            # loses that comparison on its own merits rather than needing a
            # hard cutoff. A fixed cap here previously rejected legitimate
            # fast candidates just for landing a bit past an arbitrary
            # radius (verified: Guindy, the correct answer for a Besant
            # Nagar Beach trip, sits 6.1km away — just over a 5km cap —
            # while still being the fastest reachable partial by a wide
            # margin; the cap silently dropped it and produced 0 routes).
            if best_label is not None:
                all_found_routes.append(
                    self._build_partial_route(best_label, best_dist_km, departure_time)
                )

        return all_found_routes

    def _build_partial_route(
        self,
        current_label: JourneyLabel,
        remaining_dist_km: float,
        departure_time: datetime,
    ) -> JourneyLabel:
        """
        Like _complete_route, but for when the search never reached an
        actual dest_stop — appends a final Auto/Walk leg using straight-
        line distance to the real destination (there's no dest_stops
        record to look a distance up from, since this stop isn't one).
        """
        too_far_to_walk = remaining_dist_km > MAX_COMFORTABLE_WALK_KM
        final_min = (
            remaining_dist_km / (AUTO_SPEED_KMPH if too_far_to_walk else WALKING_SPEED_KMPH)
        ) * 60
        final_arrival = current_label.arrival_time + timedelta(minutes=final_min)

        final_step = RouteStep(
            mode="Auto" if too_far_to_walk else "Walk",
            mode_label="Auto/Taxi" if too_far_to_walk else "Walk",
            agency="",
            instruction=(
                f"Public transit gets you this far — take an auto/taxi the "
                f"remaining {remaining_dist_km:.1f} km to your destination"
                if too_far_to_walk
                else f"Walk the remaining {remaining_dist_km:.1f} km to your destination"
            ),
            from_name=current_label.stop_name,
            to_name="Your Destination",
            departure_time=current_label.arrival_time,
            arrival_time=final_arrival,
            duration_minutes=round(final_min, 1),
            distance_km=round(remaining_dist_km, 2),
        )

        return JourneyLabel(
            arrival_time=final_arrival,
            stop_id=current_label.stop_id,
            stop_name=current_label.stop_name,
            steps=current_label.steps + [final_step],
            trip_ids=current_label.trip_ids,
            transfer_count=current_label.transfer_count,
        )

    @staticmethod
    def _heuristic_delta(
        lat: float | None,
        lon: float | None,
        dest_lat: float | None,
        dest_lon: float | None,
    ) -> timedelta:
        """
        Estimated remaining time from (lat, lon) to the destination, as a
        priority-queue nudge only — see HEURISTIC_SPEED_KMPH. Falls back to
        no nudge when coordinates aren't available for this stop.
        """
        if lat is None or lon is None or dest_lat is None or dest_lon is None:
            return timedelta(0)
        dist_km = haversine_distance_km(lat, lon, dest_lat, dest_lon)
        return timedelta(hours=dist_km / HEURISTIC_SPEED_KMPH)

    async def _explore_trips(
        self,
        current_label: JourneyLabel,
        departure_time: datetime,
        service_ids: list[str],
        queue: list,
        best_arrival: dict,
        dest_lat: float | None = None,
        dest_lon: float | None = None,
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

        # Rows are ordered by departure_time ASC and, at a busy stop, can
        # include many repeat departures of the same route (a bus running
        # every few minutes contributes one row per run). Only the
        # earliest instance of a route can ever produce a better arrival
        # anywhere downstream — a later run on the same route just shifts
        # every downstream time later by the same amount — so exploring
        # every later instance too was pure redundant work: each one did
        # its own get_trip_stops_after() DB round trip for that route's
        # entire stop list, which is exactly what made a single search
        # iteration balloon into 100+ queries and made real requests hang
        # for minutes. Keeping only the first trip seen per route_id keeps
        # the search's results identical while cutting that cost sharply.
        seen_routes: set = set()
        deduped_trips = []
        for t in trips:
            if t["route_id"] in seen_routes:
                continue
            seen_routes.add(t["route_id"])
            deduped_trips.append(t)
        trips = deduped_trips

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

                # Use a flat assumed wait rather than the exact computed
                # headway gap — headway_secs/freq_window are kept from the
                # real data below purely as informational context, not
                # used to derive the wait or the actual departure time.
                wait_minutes = METRO_WAIT_MINUTES
                actual_departure = current_label.arrival_time + timedelta(
                    minutes=wait_minutes
                )
                headway_secs = freq_info["headway_seconds"]
                freq_window = (
                    f"{freq_info['window_start']}-{freq_info['window_end']}"
                )
            else:
                # Schedule-based service: use stop_times departure. This is
                # virtually every bus and train trip (frequency-based only
                # covers metro in this dataset) — leaving wait_minutes as
                # None here meant almost every transit leg silently
                # reported zero wait time, no matter how long the real gap
                # between arriving at the stop and that specific bus's
                # scheduled departure actually was.
                actual_departure = self._parse_gtfs_time(
                    trip["departure_time"],
                    departure_time.date(),
                )
                wait_minutes = max(
                    0.0,
                    (actual_departure - current_label.arrival_time).total_seconds() / 60.0,
                )
                # Bus specifically gets a realistic minimum buffer — see
                # MIN_BUS_WAIT_MINUTES. Shift actual_departure (not just the
                # wait_minutes stat) so the padded wait genuinely propagates
                # through arrival time, total duration, and scoring, rather
                # than being cosmetic on a number nothing downstream reads.
                if trip.get("route_type") == 3 and wait_minutes < MIN_BUS_WAIT_MINUTES:
                    wait_minutes = MIN_BUS_WAIT_MINUTES
                    actual_departure = current_label.arrival_time + timedelta(
                        minutes=wait_minutes
                    )
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
                    wait_time_minutes=round(wait_minutes, 1) if wait_minutes is not None else None,
                )

                # Boarding a vehicle is a real transfer once it's not the
                # first one of the journey — even when it happens to be at
                # the same physical stop the previous one dropped you at.
                # Previously this only incremented in _explore_transfers
                # (walking to a different stop), so a route stitched
                # together from five separate buses, each caught right
                # where the last one left off, scored as "0 transfers" —
                # indistinguishable from one direct ride, hiding exactly
                # the cumulative wait/connection risk each extra boarding
                # actually costs a real rider.
                new_transfer_count = (
                    current_label.transfer_count + 1 if current_label.trip_ids else current_label.transfer_count
                )

                new_label = JourneyLabel(
                    arrival_time=actual_arrival,
                    stop_id=ds_stop_id,
                    stop_name=ds["stop_name"],
                    steps=current_label.steps + [transit_step],
                    trip_ids=current_label.trip_ids + [trip_id],
                    transfer_count=new_transfer_count,
                )

                arrival_key = (ds_stop_id, new_label.transfer_count)
                if (
                    arrival_key not in best_arrival
                    or actual_arrival < best_arrival[arrival_key]
                ):
                    best_arrival[arrival_key] = actual_arrival
                    priority = actual_arrival + self._heuristic_delta(
                        ds.get("lat"), ds.get("lon"), dest_lat, dest_lon
                    )
                    heapq.heappush(
                        queue,
                        (priority, ds_stop_id, new_label),
                    )

    async def _explore_transfers(
        self,
        current_label: JourneyLabel,
        queue: list,
        best_arrival: dict,
        dest_lat: float | None = None,
        dest_lon: float | None = None,
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
                priority = transfer_arrival + self._heuristic_delta(
                    n.get("lat"), n.get("lon"), dest_lat, dest_lon
                )
                heapq.heappush(
                    queue,
                    (priority, n["stop_id"], new_label),
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
        too_far_to_walk = final_walk_dist > MAX_COMFORTABLE_WALK_KM
        final_walk_min = (
            final_walk_dist / (AUTO_SPEED_KMPH if too_far_to_walk else WALKING_SPEED_KMPH)
        ) * 60
        final_walk_arrival = current_label.arrival_time + timedelta(
            minutes=final_walk_min
        )

        final_step = RouteStep(
            mode="Auto" if too_far_to_walk else "Walk",
            mode_label="Auto/Taxi" if too_far_to_walk else "Walk",
            agency="",
            instruction=(
                f"Too far to walk ({final_walk_dist:.1f} km) — take an auto/taxi to your destination"
                if too_far_to_walk
                else "Walk to destination"
            ),
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
        waits = [r.total_wait_minutes for r in routes]

        min_dur, max_dur = min(durations), max(durations)
        min_trans, max_trans = min(transfers), max(transfers)
        min_walk, max_walk = min(walking), max(walking)
        min_wait, max_wait = min(waits), max(waits)

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

            # Wait-time score — separate from the transfer count itself:
            # two routes with the same number of transfers can have very
            # different total buffer time depending on how well each
            # connection actually lines up.
            if max_wait > min_wait:
                score_wait = (route.total_wait_minutes - min_wait) / (max_wait - min_wait)
            else:
                score_wait = 0.0

            # ── Weighted combination ──
            final_score = (
                prefs.weight_duration * score_dur
                + prefs.weight_transfers * score_trans
                + prefs.weight_walking * score_walk
                + prefs.weight_mode_preference * score_mode
                + prefs.weight_wait_time * score_wait
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
            route.score_wait = round(score_wait, 3)
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
        Parse a GTFS time (may be >24:00:00, i.e. after midnight of the
        service day) into a datetime. Accepts either a timedelta (what
        asyncpg decodes a Postgres INTERVAL column into) or a raw
        "HH:MM:SS" GTFS string. A timedelta must be handled via
        total_seconds() rather than str()'d and split on ":" — for values
        >=24h, str(timedelta) renders as "N day(s), H:MM:SS", not the
        "HH:MM:SS" this parser expects, which crashed on int("1 day, 0").
        """

        if isinstance(time_str, timedelta):
            hours, remainder = divmod(int(time_str.total_seconds()), 3600)
            minutes, seconds = divmod(remainder, 60)
        else:
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
    """Convert an INTERVAL (a timedelta, once asyncpg decodes it) or
    HH:MM:SS string to total seconds. A timedelta is read via
    total_seconds() directly — str()'ing one >=24h renders as
    "N day(s), H:MM:SS", which the HH:MM:SS split below can't parse.
    """
    if interval_val is None:
        return 0
    if isinstance(interval_val, timedelta):
        return int(interval_val.total_seconds())

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
