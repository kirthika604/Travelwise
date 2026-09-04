from datetime import date, datetime, timedelta
from typing import Any

import asyncpg

from app.time_utils import time_of_day


class TransitRepository:

    def __init__(
        self,
        pool: asyncpg.Pool,
    ):
        self.pool = pool

    # ──────────────────────────────────────────────
    # EXISTING METHODS (unchanged)
    # ──────────────────────────────────────────────

    async def get_nearby_stops(
        self,
        latitude: float,
        longitude: float,
        radius_km: float,
        limit: int = 10,
    ) -> list[asyncpg.Record]:

        query = """
            SELECT
                s.stop_id,
                s.stop_name,
                s.lat AS stop_lat,
                s.lon AS stop_lon,

                ST_Distance(
                    s.location,
                    ST_SetSRID(
                        ST_MakePoint($1, $2),
                        4326
                    )::geography
                ) / 1000.0
                AS distance_km

            FROM transit.stops s

            WHERE ST_DWithin(
                s.location,
                ST_SetSRID(
                    ST_MakePoint($1, $2),
                    4326
                )::geography,
                $3
            )

            ORDER BY s.location <-> ST_SetSRID(
                ST_MakePoint($1, $2),
                4326
            )

            LIMIT $4
        """

        async with self.pool.acquire() as connection:
            return await connection.fetch(
                query,
                longitude,
                latitude,
                radius_km * 1000,
                limit,
            )

    async def get_stop_coords(self, stop_ids: list[str]) -> dict[str, tuple[float, float]]:
        """
        Batched (lat, lon) lookup for a set of stop ids — used when the
        search never reaches the destination at all, to work out which of
        the stops it *did* reach is geographically closest to it, so that
        can be offered as a partial journey instead of a bare "no routes".
        """
        if not stop_ids:
            return {}

        async with self.pool.acquire() as connection:
            rows = await connection.fetch(
                "SELECT stop_id, lat, lon FROM transit.stops WHERE stop_id = ANY($1::text[])",
                stop_ids,
            )
        return {row["stop_id"]: (row["lat"], row["lon"]) for row in rows}

    async def filter_stops_by_route_types(
        self, stop_ids: list[str], route_types: list[int]
    ) -> set[str]:
        """
        Which of these stop_ids are served by at least one trip on any of
        the given GTFS route_types (e.g. [1, 2] for Metro/Train) — used to
        seed a supplementary train/metro-only search. The main search is a
        greedy earliest-arrival walk over the whole graph, and a stop
        served mostly by frequent buses generates far more competing queue
        entries than one served by a once-every-15-minutes train; the
        train branch can end up never finishing at all, not just ranked
        lower, even when a real direct train exists. This lets the caller
        give train/metro their own dedicated shot instead of leaving them
        to win or lose that race.
        """
        if not stop_ids:
            return set()

        async with self.pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT DISTINCT st.stop_id
                FROM transit.stop_times st
                JOIN transit.trips t ON t.trip_id = st.trip_id
                JOIN transit.routes r ON r.route_id = t.route_id
                WHERE st.stop_id = ANY($1::text[])
                  AND r.route_type = ANY($2::int[])
                """,
                stop_ids,
                route_types,
            )
        return {row["stop_id"] for row in rows}

    async def find_direct_connections(
        self,
        origin_stop_ids: list[str],
        destination_stop_ids: list[str],
        departure_time: str,
        limit: int,
    ) -> list[asyncpg.Record]:

        query = """
            SELECT
                origin_stop.stop_id AS origin_stop_id,
                destination_stop.stop_id AS destination_stop_id,

                origin_stop.stop_name AS origin_stop_name,
                destination_stop.stop_name AS destination_stop_name,

                origin_time.departure_time,
                destination_time.arrival_time,

                t.trip_id,

                r.route_id,
                r.route_short_name,
                r.route_long_name,
                r.route_type

            FROM transit.stop_times origin_time

            JOIN transit.stop_times destination_time
                ON destination_time.trip_id =
                   origin_time.trip_id

                AND destination_time.stop_sequence >
                    origin_time.stop_sequence

            JOIN transit.stops origin_stop
                ON origin_stop.stop_id =
                   origin_time.stop_id

            JOIN transit.stops destination_stop
                ON destination_stop.stop_id =
                   destination_time.stop_id

            JOIN transit.trips t
                ON t.trip_id =
                   origin_time.trip_id

            JOIN transit.routes r
                ON r.route_id = t.route_id

            WHERE origin_time.stop_id = ANY($1::text[])

              AND destination_stop.stop_id = ANY($2::text[])

              AND origin_time.departure_time >=
                  $3::time

            ORDER BY
                origin_time.departure_time ASC

            LIMIT $4
        """

        async with self.pool.acquire() as connection:
            return await connection.fetch(
                query,
                origin_stop_ids,
                destination_stop_ids,
                departure_time,
                limit,
            )

    # ──────────────────────────────────────────────
    # MULTI-MODAL ROUTING METHODS
    # ──────────────────────────────────────────────

    async def get_active_service_ids(
        self,
        target_date: date,
    ) -> list[str]:
        """
        Get service_ids active on the given date.
        Checks calendar table for day-of-week and date range validity.
        """

        day_of_week = target_date.weekday()

        day_columns = {
            0: "monday",
            1: "tuesday",
            2: "wednesday",
            3: "thursday",
            4: "friday",
            5: "saturday",
            6: "sunday",
        }

        day_column = day_columns[day_of_week]

        query = f"""
            SELECT service_id
            FROM transit.calendar
            WHERE {day_column} = TRUE
              AND (start_date IS NULL OR start_date <= $1)
              AND (end_date IS NULL   OR end_date >= $1)
        """

        async with self.pool.acquire() as connection:
            rows = await connection.fetch(query, target_date)
            return [row["service_id"] for row in rows]

    async def get_trips_from_stop(
        self,
        stop_id: str,
        departure_after: datetime,
        service_ids: list[str],
        limit: int = 100,
    ) -> list[asyncpg.Record]:
        """
        Get all trips departing from a stop at or after the given time.
        Filters by active service_ids for time-based availability.
        """

        departure_time_interval = time_of_day(departure_after)

        query = """
            SELECT
                t.trip_id,
                t.route_id,
                t.service_id,
                r.route_short_name,
                r.route_long_name,
                r.route_type,
                st.departure_time,
                st.stop_sequence
            FROM transit.stop_times st
            JOIN transit.trips t
                ON t.trip_id = st.trip_id
            JOIN transit.routes r
                ON r.route_id = t.route_id
            WHERE st.stop_id = $1
              AND st.departure_time >= $2::interval
              AND t.service_id = ANY($3::text[])
            ORDER BY st.departure_time ASC
            LIMIT $4
        """

        async with self.pool.acquire() as connection:
            return await connection.fetch(
                query,
                stop_id,
                departure_time_interval,
                service_ids,
                limit,
            )

    async def get_trip_stops_after(
        self,
        trip_id: str,
        after_stop_id: str,
    ) -> list[asyncpg.Record]:
        """
        Get all downstream stops for a trip, starting AFTER the given stop.
        Returns stops in sequence order with arrival times.
        """

        query = """
            WITH trip_stops AS (
                SELECT
                    st.stop_id,
                    s.stop_name,
                    s.lat,
                    s.lon,
                    st.arrival_time,
                    st.departure_time,
                    st.stop_sequence,
                    ROW_NUMBER() OVER (
                        ORDER BY st.stop_sequence
                    ) AS seq_num
                FROM transit.stop_times st
                JOIN transit.stops s
                    ON s.stop_id = st.stop_id
                WHERE st.trip_id = $1
            ),
            after_pos AS (
                SELECT seq_num
                FROM trip_stops
                WHERE stop_id = $2
            )
            SELECT
                ts.stop_id,
                ts.stop_name,
                ts.lat,
                ts.lon,
                ts.arrival_time,
                ts.departure_time,
                ts.stop_sequence
            FROM trip_stops ts
            CROSS JOIN after_pos ap
            WHERE ts.seq_num > ap.seq_num
            ORDER BY ts.stop_sequence ASC
        """

        async with self.pool.acquire() as connection:
            return await connection.fetch(query, trip_id, after_stop_id)

    async def get_nearby_stops_by_id(
        self,
        stop_id: str,
        radius_km: float = 0.5,
        limit: int = 10,
    ) -> list[asyncpg.Record]:
        """
        Find stops near a given stop (for transfers between routes).
        """

        query = """
            WITH target AS (
                SELECT location
                FROM transit.stops
                WHERE stop_id = $1
            )
            SELECT
                s.stop_id,
                s.stop_name,
                s.lat,
                s.lon,
                ST_Distance(
                    s.location,
                    t.location
                ) / 1000.0 AS distance_km
            FROM transit.stops s
            CROSS JOIN target t
            WHERE s.stop_id != $1
              AND ST_DWithin(
                  s.location,
                  t.location,
                  $2 * 1000
              )
            ORDER BY s.location <-> t.location
            LIMIT $3
        """

        async with self.pool.acquire() as connection:
            return await connection.fetch(
                query,
                stop_id,
                radius_km,
                limit,
            )

    # ──────────────────────────────────────────────
    # FREQUENCY-BASED SERVICE METHODS
    # ──────────────────────────────────────────────

    async def get_frequencies_for_trips(
        self,
        trip_ids: list[str],
    ) -> list[asyncpg.Record]:
        """
        Get frequency data (headway info) for a list of trips.
        Only returns trips that have frequency entries in the frequencies table.

        Returns records with:
            trip_id, start_time, end_time, headway_secs, exact_times
        """

        if not trip_ids:
            return []

        query = """
            SELECT
                trip_id,
                start_time,
                end_time,
                headway_secs,
                exact_times
            FROM transit.frequencies
            WHERE trip_id = ANY($1::text[])
            ORDER BY trip_id, start_time
        """

        async with self.pool.acquire() as connection:
            return await connection.fetch(query, trip_ids)

    async def get_next_frequency_departure(
        self,
        trip_id: str,
        after_time: datetime,
        reference_date: date,
    ) -> dict | None:
        """
        For a frequency-based trip, calculate the next departure after after_time.

        Logic:
        1. Find the frequency window that contains after_time
        2. If after_time is before any window, use the first window's start_time
        3. If after_time is inside a window, calculate next departure using headway
        4. If after_time is after all windows, return None

        Returns dict with:
            next_departure: datetime
            headway_seconds: int
            window_start: str (e.g., "08:00:00")
            window_end: str (e.g., "11:00:00")
            wait_seconds: int (estimated wait time)
        """

        query = """
            SELECT
                start_time,
                end_time,
                headway_secs,
                exact_times
            FROM transit.frequencies
            WHERE trip_id = $1
            ORDER BY start_time
        """

        async with self.pool.acquire() as connection:
            rows = await connection.fetch(query, trip_id)

        if not rows:
            return None

        current_time_of_day = after_time.hour * 3600 + after_time.minute * 60 + after_time.second

        for row in rows:
            start = self._interval_to_seconds(row["start_time"])
            end = self._interval_to_seconds(row["end_time"])
            headway = row["headway_secs"]

            # If current time is before this window, the first train is at window start
            if current_time_of_day < start:
                next_dep_seconds = start
                wait = start - current_time_of_day
                return {
                    "next_departure": self._seconds_to_datetime(
                        next_dep_seconds, reference_date
                    ),
                    "headway_seconds": headway,
                    "window_start": str(row["start_time"]),
                    "window_end": str(row["end_time"]),
                    "wait_seconds": wait,
                }

            # If current time is inside this window, calculate next departure
            if start <= current_time_of_day <= end:
                # Find next departure using headway
                time_since_window_start = current_time_of_day - start
                departures_elapsed = time_since_window_start // headway
                next_dep_seconds = start + (departures_elapsed + 1) * headway

                # Check if next departure is still within window
                if next_dep_seconds <= end:
                    wait = next_dep_seconds - current_time_of_day
                    return {
                        "next_departure": self._seconds_to_datetime(
                            next_dep_seconds, reference_date
                        ),
                        "headway_seconds": headway,
                        "window_start": str(row["start_time"]),
                        "window_end": str(row["end_time"]),
                        "wait_seconds": wait,
                    }
                # Next departure is in next window, continue to next row

        # After all windows — service ended
        return None

    async def is_trip_frequency_based(
        self,
        trip_ids: list[str],
    ) -> dict[str, bool]:
        """
        Check which trips have frequency entries.
        Returns dict mapping trip_id -> True/False.
        """

        if not trip_ids:
            return {}

        query = """
            SELECT DISTINCT trip_id
            FROM transit.frequencies
            WHERE trip_id = ANY($1::text[])
        """

        async with self.pool.acquire() as connection:
            rows = await connection.fetch(query, trip_ids)

        freq_trip_ids = {row["trip_id"] for row in rows}
        return {tid: tid in freq_trip_ids for tid in trip_ids}

    # ──────────────────────────────────────────────
    # HELPER METHODS
    # ──────────────────────────────────────────────

    @staticmethod
    def _interval_to_seconds(interval_val) -> int:
        """
        Convert a PostgreSQL INTERVAL or string like '08:00:00' to total seconds.
        Handles both INTERVAL objects and string representations. A
        timedelta (what asyncpg actually decodes an INTERVAL into) is read
        via total_seconds() directly — str()'ing one >=24h renders as
        "N day(s), H:MM:SS", which the HH:MM:SS split below can't parse.
        """

        if interval_val is None:
            return 0
        if isinstance(interval_val, timedelta):
            return int(interval_val.total_seconds())

        s = str(interval_val).strip()

        # Handle HH:MM:SS format
        parts = s.split(":")
        if len(parts) == 3:
            hours = int(parts[0])
            minutes = int(parts[1])
            seconds = int(float(parts[2]))
            return hours * 3600 + minutes * 60 + seconds

        # Handle INTERVAL format like "8 hours"
        # This is a fallback — PostgreSQL INTERVAL usually renders as HH:MM:SS
        return 0

    @staticmethod
    def _seconds_to_datetime(total_seconds: int, reference_date: date) -> datetime:
        """
        Convert total seconds since midnight to a datetime.
        Handles times > 24:00 (next day).
        """

        day_offset = 0
        if total_seconds >= 86400:  # 24 * 3600
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
