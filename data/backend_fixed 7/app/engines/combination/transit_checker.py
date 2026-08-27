"""
Transit Availability Checker for the Combination Engine.

Checks if public transport is available between two places at a given time.
Returns actual transit connections with real departure/arrival times.

This bridges the Combination Engine with the transit data, replacing
the fake 25 km/h estimate with real schedule lookups.

Supports:
  - Clear distinction between Bus (MTC), Metro (CMRL), Train (SR)
  - Agency-specific labeling and display
  - Multimodal connections (Bus→Metro, Metro→Train, etc.)
  - Time-based availability (weekday/weekend service filtering)
"""

from datetime import datetime, timedelta
from dataclasses import dataclass

from ..routing.transit_repository import TransitRepository


# ──────────────────────────────────────────────
# Constants
# ──────────────────────────────────────────────

WALKING_SPEED_KMPH = 5.0

# GTFS route_type → (Mode Name, Display Label, Color, Agency)
GTFS_ROUTE_MODES = {
    0: ("Tram", "Tram", "#E67E22", ""),
    1: ("Metro", "CMRL Metro", "#2E86C1", "CMRL"),
    2: ("Train", "SR Suburban Train", "#8E44AD", "SR"),
    3: ("Bus", "MTC Bus", "#27AE60", "MTC"),
    4: ("Ferry", "Ferry", "#3498DB", ""),
}

# Mode-specific display names for the combination engine
MODE_DISPLAY = {
    "Bus": {"icon": "🚌", "color": "#27AE60", "agency": "MTC"},
    "Metro": {"icon": "🚇", "color": "#2E86C1", "agency": "CMRL"},
    "Train": {"icon": "🚂", "color": "#8E44AD", "agency": "SR"},
    "Tram": {"icon": "🚊", "color": "#E67E22", "agency": ""},
    "Ferry": {"icon": "⛴️", "color": "#3498DB", "agency": ""},
    "Walk": {"icon": "🚶", "color": "#95A5A6", "agency": ""},
}


# ──────────────────────────────────────────────
# Data structures
# ──────────────────────────────────────────────

@dataclass
class TransitConnection:
    """
    A validated transit connection between two points.
    Contains all details needed for an ItineraryLeg.
    """

    # Timing
    depart_at: datetime
    arrive_at: datetime
    travel_duration_minutes: float

    # Mode
    mode: str  # "Walk", "Bus", "Metro", "Train", "Walk+Bus+Walk", etc.
    mode_label: str  # "MTC Bus 51C", "CMRL Metro Blue Line", etc.
    agency: str  # "MTC", "CMRL", "SR"

    # Walking
    walking_distance_km: float = 0.0
    walking_minutes: float = 0.0

    # Transit details
    transit_available: bool = False
    route_name: str | None = None
    route_type: int | None = None
    trip_id: str | None = None
    service_id: str | None = None
    board_stop: str | None = None
    alight_stop: str | None = None
    wait_time_minutes: float = 0.0
    transit_time_minutes: float = 0.0
    transfers: int = 0

    # Human-readable steps
    steps_summary: list[str] | None = None

    # Detailed route steps
    route_steps: list[dict] | None = None


@dataclass
class WalkingConnection:
    """Fallback when no transit is available."""

    depart_at: datetime
    arrive_at: datetime
    walking_duration_minutes: float
    walking_distance_km: float


# ──────────────────────────────────────────────
# Main checker class
# ──────────────────────────────────────────────

class TransitAvailabilityChecker:
    """
    Checks if transit is available between two locations at a given time.

    Supports Bus, Metro, and Train with clear distinction:
      - Bus (MTC): 4611 routes, most common
      - Metro (CMRL): Blue Line, Green Line, Inter-Corridor
      - Train (SR): Suburban lines (North, South, West) + MRTS

    Usage:
        checker = TransitAvailabilityChecker(repository)
        connection = await checker.find_connection(
            from_lat=13.05, from_lon=80.28,
            to_lat=12.97, to_lon=80.24,
            depart_at=datetime(2024, 1, 15, 9, 30),
        )
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

        mode_name, display_label, color, agency = GTFS_ROUTE_MODES.get(
            route_type, ("Unknown", "Unknown", "#95A5A6", "")
        )
        icon = MODE_DISPLAY.get(mode_name, {}).get("icon", "🚌")

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

    async def find_connection(
        self,
        from_lat: float,
        from_lon: float,
        to_lat: float,
        to_lon: float,
        depart_at: datetime,
        max_walking_distance_km: float = 1.0,
        max_transfers: int = 2,
    ) -> TransitConnection | None:
        """
        Find the best transit connection between two points.

        Tries in order:
          1. Metro (fastest, most reliable)
          2. Train (fast, good for long distances)
          3. Bus (most coverage)
          4. Multimodal (Metro→Bus, Bus→Metro, etc.)

        Returns:
            TransitConnection if transit is available
            None if no transit found (caller should use walking fallback)
        """

        # ── Step 1: Find stops near origin ──
        origin_stops = await self.repository.get_nearby_stops(
            latitude=from_lat,
            longitude=from_lon,
            radius_km=max_walking_distance_km,
            limit=15,
        )

        if not origin_stops:
            return None

        # ── Step 2: Find stops near destination ──
        dest_stops = await self.repository.get_nearby_stops(
            latitude=to_lat,
            longitude=to_lon,
            radius_km=max_walking_distance_km,
            limit=15,
        )

        if not dest_stops:
            return None

        # ── Step 3: Get active service IDs ──
        service_ids = await self.repository.get_active_service_ids(
            depart_at.date()
        )

        if not service_ids:
            return None

        # ── Step 4: Try each mode in priority order ──

        # Try Metro first (most reliable)
        metro_conn = await self._find_direct_connection_by_mode(
            origin_stops=origin_stops,
            dest_stops=dest_stops,
            depart_at=depart_at,
            service_ids=service_ids,
            preferred_route_type=1,  # Metro
        )
        if metro_conn:
            return metro_conn

        # Try Train second
        train_conn = await self._find_direct_connection_by_mode(
            origin_stops=origin_stops,
            dest_stops=dest_stops,
            depart_at=depart_at,
            service_ids=service_ids,
            preferred_route_type=2,  # Train
        )
        if train_conn:
            return train_conn

        # Try Bus third (most coverage)
        bus_conn = await self._find_direct_connection_by_mode(
            origin_stops=origin_stops,
            dest_stops=dest_stops,
            depart_at=depart_at,
            service_ids=service_ids,
            preferred_route_type=3,  # Bus
        )
        if bus_conn:
            return bus_conn

        # Try any direct connection
        any_conn = await self._find_direct_connection(
            origin_stops=origin_stops,
            dest_stops=dest_stops,
            depart_at=depart_at,
            service_ids=service_ids,
        )
        if any_conn:
            return any_conn

        # ── Step 5: Try with one transfer ──
        if max_transfers >= 1:
            with_transfer = await self._find_connection_with_transfer(
                origin_stops=origin_stops,
                dest_stops=dest_stops,
                depart_at=depart_at,
                service_ids=service_ids,
            )
            if with_transfer:
                return with_transfer

        return None

    async def find_best_connection(
        self,
        from_lat: float,
        from_lon: float,
        to_lat: float,
        to_lon: float,
        depart_at: datetime,
        max_walking_distance_km: float = 1.0,
        max_transfers: int = 2,
        fallback_walk_speed_kmph: float = 5.0,
    ) -> TransitConnection:
        """
        Find the best connection, falling back to walking if no transit.

        Always returns a connection (either transit or walking).
        """

        # Try transit first
        transit = await self.find_connection(
            from_lat=from_lat,
            from_lon=from_lon,
            to_lat=to_lat,
            to_lon=to_lon,
            depart_at=depart_at,
            max_walking_distance_km=max_walking_distance_km,
            max_transfers=max_transfers,
        )

        if transit:
            return transit

        # Fallback: walking
        return self._walking_fallback(
            from_lat=from_lat,
            from_lon=from_lon,
            to_lat=to_lat,
            to_lon=to_lon,
            depart_at=depart_at,
            walk_speed_kmph=fallback_walk_speed_kmph,
        )

    # ──────────────────────────────────────────
    # Mode-specific direct connection search
    # ──────────────────────────────────────────

    async def _find_direct_connection_by_mode(
        self,
        origin_stops: list,
        dest_stops: list,
        depart_at: datetime,
        service_ids: list[str],
        preferred_route_type: int,
    ) -> TransitConnection | None:
        """
        Find a direct connection using a specific route type (Metro/Train/Bus).
        """

        origin_stop_ids = [row["stop_id"] for row in origin_stops]
        dest_stop_ids = [row["stop_id"] for row in dest_stops]

        query = """
            SELECT
                st_o.trip_id,
                st_o.stop_id AS origin_stop_id,
                st_o.departure_time,
                st_o.stop_sequence AS origin_seq,
                st_d.stop_id AS dest_stop_id,
                st_d.arrival_time,
                st_d.stop_sequence AS dest_seq,
                t.route_id,
                t.service_id,
                r.route_short_name,
                r.route_long_name,
                r.route_type,
                os.stop_name AS origin_stop_name,
                ds.stop_name AS dest_stop_name
            FROM transit.stop_times st_o
            JOIN transit.stop_times st_d
                ON st_d.trip_id = st_o.trip_id
                AND st_d.stop_sequence > st_o.stop_sequence
            JOIN transit.trips t ON t.trip_id = st_o.trip_id
            JOIN transit.routes r ON r.route_id = t.route_id
            JOIN transit.stops os ON os.stop_id = st_o.stop_id
            JOIN transit.stops ds ON ds.stop_id = st_d.stop_id
            WHERE st_o.stop_id = ANY($1::text[])
              AND st_d.stop_id = ANY($2::text[])
              AND st_o.departure_time >= $3::interval
              AND r.route_type = $4
              AND t.service_id = ANY($5::text[])
            ORDER BY st_o.departure_time ASC
            LIMIT 3
        """

        async with self.repository.pool.acquire() as connection:
            rows = await connection.fetch(
                query,
                origin_stop_ids,
                dest_stop_ids,
                depart_at.strftime("%H:%M:%S"),
                preferred_route_type,
                service_ids,
            )

        if not rows:
            return None

        return self._build_connection_from_row(
            rows[0], origin_stops, dest_stops, depart_at
        )

    # ──────────────────────────────────────────
    # Any direct connection search
    # ──────────────────────────────────────────

    async def _find_direct_connection(
        self,
        origin_stops: list,
        dest_stops: list,
        depart_at: datetime,
        service_ids: list[str],
    ) -> TransitConnection | None:
        """
        Find a direct transit connection (no transfers) from any origin stop
        to any destination stop.
        """

        origin_stop_ids = [row["stop_id"] for row in origin_stops]
        dest_stop_ids = [row["stop_id"] for row in dest_stops]

        query = """
            SELECT
                st_o.trip_id,
                st_o.stop_id AS origin_stop_id,
                st_o.departure_time,
                st_o.stop_sequence AS origin_seq,
                st_d.stop_id AS dest_stop_id,
                st_d.arrival_time,
                st_d.stop_sequence AS dest_seq,
                t.route_id,
                t.service_id,
                r.route_short_name,
                r.route_long_name,
                r.route_type,
                os.stop_name AS origin_stop_name,
                ds.stop_name AS dest_stop_name
            FROM transit.stop_times st_o
            JOIN transit.stop_times st_d
                ON st_d.trip_id = st_o.trip_id
                AND st_d.stop_sequence > st_o.stop_sequence
            JOIN transit.trips t ON t.trip_id = st_o.trip_id
            JOIN transit.routes r ON r.route_id = t.route_id
            JOIN transit.stops os ON os.stop_id = st_o.stop_id
            JOIN transit.stops ds ON ds.stop_id = st_d.stop_id
            WHERE st_o.stop_id = ANY($1::text[])
              AND st_d.stop_id = ANY($2::text[])
              AND st_o.departure_time >= $3::interval
              AND t.service_id = ANY($4::text[])
            ORDER BY st_o.departure_time ASC
            LIMIT 5
        """

        async with self.repository.pool.acquire() as connection:
            rows = await connection.fetch(
                query,
                origin_stop_ids,
                dest_stop_ids,
                depart_at.strftime("%H:%M:%S"),
                service_ids,
            )

        if not rows:
            return None

        # Find the best connection (first one that works)
        for row in rows:
            result = self._build_connection_from_row(
                row, origin_stops, dest_stops, depart_at
            )
            if result:
                return result

        return None

    def _build_connection_from_row(
        self,
        row,
        origin_stops: list,
        dest_stops: list,
        depart_at: datetime,
    ) -> TransitConnection | None:
        """
        Build a TransitConnection from a database row.
        Handles mode labeling and agency identification.
        """

        dep_time = self._parse_time(row["departure_time"], depart_at.date())
        arr_time = self._parse_time(row["arrival_time"], depart_at.date())

        if arr_time <= dep_time:
            arr_time += timedelta(days=1)

        # Find walking distances
        origin_stop = next(
            (s for s in origin_stops if s["stop_id"] == row["origin_stop_id"]),
            None,
        )
        dest_stop = next(
            (s for s in dest_stops if s["stop_id"] == row["dest_stop_id"]),
            None,
        )

        origin_walk_km = float(origin_stop["distance_km"]) if origin_stop else 0.3
        dest_walk_km = float(dest_stop["distance_km"]) if dest_stop else 0.3

        origin_walk_min = (origin_walk_km / WALKING_SPEED_KMPH) * 60
        dest_walk_min = (dest_walk_km / WALKING_SPEED_KMPH) * 60

        # User needs to walk to origin stop before departure
        user_depart = dep_time - timedelta(minutes=origin_walk_min)
        user_arrive = arr_time + timedelta(minutes=dest_walk_min)

        # Check if user can make it (can't depart before requested time)
        if user_depart < depart_at:
            return None

        transit_duration = (arr_time - dep_time).total_seconds() / 60
        total_duration = (user_arrive - user_depart).total_seconds() / 60

        # Get mode info
        route_type = row["route_type"]
        mode_info = self._get_mode_info(route_type)
        mode_name = mode_info["mode"]
        agency = mode_info["agency"]

        route_name = (
            row["route_short_name"]
            or row["route_long_name"]
            or row["trip_id"]
        )

        # Format friendly mode label
        mode_label = self._format_mode_label(route_name, route_type, agency)

        # Build steps
        steps = [
            f"Walk {origin_walk_min:.0f} min to {row['origin_stop_name']}",
            f"Take {mode_label} from {row['origin_stop_name']} to {row['dest_stop_name']}",
            f"Walk {dest_walk_min:.0f} min to destination",
        ]

        # Build route steps
        route_steps = [
            {
                "mode": "Walk",
                "mode_label": "Walk",
                "instruction": f"Walk to {row['origin_stop_name']}",
                "from_name": "Your Location",
                "to_name": row["origin_stop_name"],
                "duration_minutes": round(origin_walk_min, 1),
                "distance_km": round(origin_walk_km, 2),
            },
            {
                "mode": mode_name,
                "mode_label": mode_label,
                "instruction": f"Take {mode_label} from {row['origin_stop_name']} to {row['dest_stop_name']}",
                "from_name": row["origin_stop_name"],
                "to_name": row["dest_stop_name"],
                "departure_time": dep_time.isoformat(),
                "arrival_time": arr_time.isoformat(),
                "duration_minutes": round(transit_duration, 1),
                "route_name": str(route_name),
                "route_type": route_type,
                "agency": agency,
                "trip_id": row["trip_id"],
                "service_id": row["service_id"],
                "board_stop": row["origin_stop_name"],
                "alight_stop": row["dest_stop_name"],
            },
            {
                "mode": "Walk",
                "mode_label": "Walk",
                "instruction": f"Walk to destination",
                "from_name": row["dest_stop_name"],
                "to_name": "Your Destination",
                "duration_minutes": round(dest_walk_min, 1),
                "distance_km": round(dest_walk_km, 2),
            },
        ]

        return TransitConnection(
            depart_at=user_depart,
            arrive_at=user_arrive,
            travel_duration_minutes=round(total_duration, 1),
            mode=f"Walk+{mode_name}+Walk",
            mode_label=mode_label,
            agency=agency,
            walking_distance_km=round(origin_walk_km + dest_walk_km, 2),
            walking_minutes=round(origin_walk_min + dest_walk_min, 1),
            transit_available=True,
            route_name=str(route_name),
            route_type=route_type,
            trip_id=row["trip_id"],
            service_id=row["service_id"],
            board_stop=row["origin_stop_name"],
            alight_stop=row["dest_stop_name"],
            wait_time_minutes=round(
                (dep_time - user_depart).total_seconds() / 60, 1
            ),
            transit_time_minutes=round(transit_duration, 1),
            transfers=0,
            steps_summary=steps,
            route_steps=route_steps,
        )

    # ──────────────────────────────────────────
    # Connection with one transfer
    # ──────────────────────────────────────────

    async def _find_connection_with_transfer(
        self,
        origin_stops: list,
        dest_stops: list,
        depart_at: datetime,
        service_ids: list[str],
    ) -> TransitConnection | None:
        """
        Find a connection with one transfer at an intermediate stop.
        Uses a transfer hub approach: find stops that connect multiple routes.
        """

        origin_stop_ids = [row["stop_id"] for row in origin_stops]
        dest_stop_ids = [row["stop_id"] for row in dest_stops]

        # Find transfer stops (stops served by multiple routes)
        query = """
            WITH origin_trips AS (
                SELECT DISTINCT st.trip_id
                FROM transit.stop_times st
                WHERE st.stop_id = ANY($1::text[])
                  AND st.departure_time >= $2::interval
            ),
            dest_trips AS (
                SELECT DISTINCT st.trip_id
                FROM transit.stop_times st
                WHERE st.stop_id = ANY($3::text[])
            ),
            transfer_stops AS (
                SELECT
                    st2.stop_id,
                    st2.trip_id AS transfer_trip_id,
                    st2.departure_time AS transfer_departure,
                    st2.stop_sequence AS transfer_seq
                FROM transit.stop_times st2
                JOIN origin_trips ot ON ot.trip_id = st2.trip_id
                WHERE st2.stop_id NOT IN (SELECT UNNEST($1::text[]))
            )
            SELECT
                ts.stop_id AS transfer_stop_id,
                s.stop_name AS transfer_stop_name,
                ts.transfer_departure,
                t.trip_id AS onward_trip_id,
                rt.route_short_name AS onward_route,
                rt.route_long_name AS onward_route_long,
                rt.route_type AS onward_route_type,
                dt.stop_id AS dest_stop_id,
                ds.stop_name AS dest_stop_name,
                dt.arrival_time AS dest_arrival,
                t.service_id
            FROM transfer_stops ts
            JOIN transit.stops s ON s.stop_id = ts.stop_id
            JOIN transit.stop_times dt
                ON dt.trip_id = ts.transfer_trip_id
                AND dt.stop_sequence > ts.transfer_seq
                AND dt.stop_id = ANY($3::text[])
            JOIN transit.trips t ON t.trip_id = dt.trip_id
            JOIN transit.routes rt ON rt.route_id = t.route_id
            JOIN transit.stops ds ON ds.stop_id = dt.stop_id
            JOIN transit.trips t2 ON t2.trip_id = ts.transfer_trip_id
            WHERE t2.service_id = ANY($4::text[])
              AND t.service_id = ANY($4::text[])
            ORDER BY ts.transfer_departure ASC
            LIMIT 5
        """

        async with self.repository.pool.acquire() as connection:
            rows = await connection.fetch(
                query,
                origin_stop_ids,
                depart_at.strftime("%H:%M:%S"),
                dest_stop_ids,
                service_ids,
            )

        if not rows:
            return None

        # For now, return the first valid connection
        # A full implementation would trace the complete journey
        row = rows[0]

        transfer_depart = self._parse_time(
            row["transfer_departure"], depart_at.date()
        )
        dest_arrive = self._parse_time(row["dest_arrival"], depart_at.date())

        if dest_arrive <= transfer_depart:
            dest_arrive += timedelta(days=1)

        origin_stop = next(
            (s for s in origin_stops if True),  # Use first origin stop
            None,
        )
        dest_stop = next(
            (s for s in dest_stops if s["stop_id"] == row["dest_stop_id"]),
            None,
        )

        origin_walk_km = float(origin_stop["distance_km"]) if origin_stop else 0.3
        dest_walk_km = float(dest_stop["distance_km"]) if dest_stop else 0.3

        origin_walk_min = (origin_walk_km / WALKING_SPEED_KMPH) * 60
        dest_walk_min = (dest_walk_km / WALKING_SPEED_KMPH) * 60

        user_depart = transfer_depart - timedelta(minutes=origin_walk_min + 10)  # Buffer
        user_arrive = dest_arrive + timedelta(minutes=dest_walk_min)

        if user_depart < depart_at:
            user_depart = depart_at

        total_duration = (user_arrive - user_depart).total_seconds() / 60

        onward_route_type = row["onward_route_type"]
        mode_info = self._get_mode_info(onward_route_type)
        mode_name = mode_info["mode"]
        agency = mode_info["agency"]

        onward_route = row["onward_route"] or row["onward_route_long"] or "Unknown"
        mode_label = self._format_mode_label(
            onward_route, onward_route_type, agency
        )

        steps = [
            f"Walk to transfer stop",
            f"Take {mode_label} to {row['dest_stop_name']}",
            f"Walk to destination",
        ]

        route_steps = [
            {
                "mode": "Walk",
                "mode_label": "Walk",
                "instruction": f"Walk to transfer stop",
                "from_name": "Your Location",
                "to_name": row["transfer_stop_name"],
                "duration_minutes": round(origin_walk_min, 1),
                "distance_km": round(origin_walk_km, 2),
            },
            {
                "mode": mode_name,
                "mode_label": mode_label,
                "instruction": f"Take {mode_label} from {row['transfer_stop_name']} to {row['dest_stop_name']}",
                "from_name": row["transfer_stop_name"],
                "to_name": row["dest_stop_name"],
                "departure_time": transfer_depart.isoformat(),
                "arrival_time": dest_arrive.isoformat(),
                "duration_minutes": round(
                    (dest_arrive - transfer_depart).total_seconds() / 60, 1
                ),
                "route_name": onward_route,
                "route_type": onward_route_type,
                "agency": agency,
                "trip_id": row["onward_trip_id"],
                "service_id": row["service_id"],
                "board_stop": row["transfer_stop_name"],
                "alight_stop": row["dest_stop_name"],
            },
            {
                "mode": "Walk",
                "mode_label": "Walk",
                "instruction": f"Walk to destination",
                "from_name": row["dest_stop_name"],
                "to_name": "Your Destination",
                "duration_minutes": round(dest_walk_min, 1),
                "distance_km": round(dest_walk_km, 2),
            },
        ]

        return TransitConnection(
            depart_at=user_depart,
            arrive_at=user_arrive,
            travel_duration_minutes=round(total_duration, 1),
            mode=f"Walk+{mode_name}+Walk",
            mode_label=mode_label,
            agency=agency,
            walking_distance_km=round(origin_walk_km + dest_walk_km, 2),
            walking_minutes=round(origin_walk_min + dest_walk_min, 1),
            transit_available=True,
            route_name=onward_route,
            route_type=onward_route_type,
            trip_id=row["onward_trip_id"],
            service_id=row["service_id"],
            board_stop=row["transfer_stop_name"],
            alight_stop=row["dest_stop_name"],
            wait_time_minutes=10.0,  # Estimated transfer time
            transit_time_minutes=round(
                (dest_arrive - transfer_depart).total_seconds() / 60, 1
            ),
            transfers=1,
            steps_summary=steps,
            route_steps=route_steps,
        )

    # ──────────────────────────────────────────
    # Walking fallback
    # ──────────────────────────────────────────

    def _walking_fallback(
        self,
        from_lat: float,
        from_lon: float,
        to_lat: float,
        to_lon: float,
        depart_at: datetime,
        walk_speed_kmph: float = 5.0,
    ) -> TransitConnection:
        """
        Create a walking-only connection when no transit is available.
        """

        from math import atan2, cos, radians, sin, sqrt

        # Haversine distance
        lat1, lon1 = radians(from_lat), radians(from_lon)
        lat2, lon2 = radians(to_lat), radians(to_lon)
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        distance_km = 6371.0 * c

        walk_minutes = (distance_km / walk_speed_kmph) * 60
        arrive_at = depart_at + timedelta(minutes=walk_minutes)

        steps = [f"Walk {walk_minutes:.0f} min ({distance_km:.1f} km) to destination"]

        route_steps = [
            {
                "mode": "Walk",
                "mode_label": "Walk",
                "instruction": f"Walk {walk_minutes:.0f} min to destination",
                "from_name": "Your Location",
                "to_name": "Your Destination",
                "duration_minutes": round(walk_minutes, 1),
                "distance_km": round(distance_km, 2),
            }
        ]

        return TransitConnection(
            depart_at=depart_at,
            arrive_at=arrive_at,
            travel_duration_minutes=round(walk_minutes, 1),
            mode="Walk",
            mode_label="Walk",
            agency="",
            walking_distance_km=round(distance_km, 2),
            walking_minutes=round(walk_minutes, 1),
            transit_available=False,
            steps_summary=steps,
            route_steps=route_steps,
        )

    # ──────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────

    @staticmethod
    def _parse_time(time_str, reference_date) -> datetime:
        """Parse GTFS time string into datetime."""
        from datetime import date as date_type

        parts = str(time_str).split(":")
        hours = int(parts[0])
        minutes = int(parts[1]) if len(parts) > 1 else 0
        seconds = int(float(parts[2])) if len(parts) > 2 else 0

        day_offset = 0
        if hours >= 24:
            day_offset = hours // 24
            hours = hours % 24

        return datetime.combine(
            reference_date,
            datetime.min.time().replace(
                hour=hours, minute=minutes, second=seconds
            ),
        ) + timedelta(days=day_offset)
