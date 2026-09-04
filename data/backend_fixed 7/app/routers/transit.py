from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..database import get_pool
from ..schemas import NearbyStop, Departure
from ..time_utils import parse_hms

router = APIRouter(prefix="/transit", tags=["transit"])

# GTFS route_type reference used across this API:
#   0 tram, 1 subway/metro, 2 rail, 3 bus
MODE_NAMES = {0: "tram", 1: "metro", 2: "rail", 3: "bus"}


@router.get("/stops/nearby", response_model=list[NearbyStop])
async def stops_nearby(
    lat: float,
    lon: float,
    radius_m: float = 1000,
    modes: Optional[str] = Query(None, description="comma-separated GTFS route_type values, e.g. '1,3'"),
    limit: int = Query(20, le=100),
):
    mode_list = [int(m) for m in modes.split(",")] if modes else None

    sql = """
        SELECT s.stop_id, s.stop_name, s.lat, s.lon,
               ST_Distance(s.location, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography) AS distance_m,
               ARRAY_AGG(DISTINCT r.route_short_name) AS route_short_names,
               ARRAY_AGG(DISTINCT r.route_type) AS modes
        FROM transit.stops s
        JOIN transit.stop_times st ON st.stop_id = s.stop_id
        JOIN transit.trips t ON t.trip_id = st.trip_id
        JOIN transit.routes r ON r.route_id = t.route_id
        WHERE ST_DWithin(s.location, ST_SetSRID(ST_MakePoint($2,$1),4326)::geography, $3)
    """
    args = [lat, lon, radius_m]
    if mode_list:
        args.append(mode_list)
        sql += f" AND r.route_type = ANY(${len(args)})"
    sql += " GROUP BY s.stop_id, s.stop_name, s.lat, s.lon, s.location ORDER BY distance_m LIMIT $%d" % (len(args) + 1)
    args.append(limit)

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [dict(r) for r in rows]


@router.get("/stops/{stop_id}/departures", response_model=list[Departure])
async def departures(
    stop_id: str,
    after: str = Query("00:00:00", description="HH:MM:SS, only departures at/after this time"),
    service_id: Optional[str] = Query(None, description="e.g. 'weekday', 'saturday', 'sunday'"),
    limit: int = Query(20, le=100),
):
    """
    Upcoming scheduled departures at a stop. This is the raw building block
    for trip planning (combine with /transit/stops/nearby at both the
    origin place and destination place, plus transfer logic, to plan a
    full multi-modal journey — not yet implemented as a single endpoint).
    """
    where = ["st.stop_id = $1", "st.departure_time >= $2::interval"]
    args = [stop_id, parse_hms(after)]
    if service_id:
        args.append(service_id)
        where.append(f"t.service_id = ${len(args)}")
    args.append(limit)

    sql = f"""
        SELECT t.trip_id, t.route_id, r.route_short_name,
               st.departure_time::text AS departure_time, t.service_id
        FROM transit.stop_times st
        JOIN transit.trips t ON t.trip_id = st.trip_id
        JOIN transit.routes r ON r.route_id = t.route_id
        WHERE {' AND '.join(where)}
        ORDER BY st.departure_time
        LIMIT ${len(args)}
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
    if not rows:
        # distinguish "stop doesn't exist" from "no departures matched"
        async with pool.acquire() as conn:
            exists = await conn.fetchval("SELECT 1 FROM transit.stops WHERE stop_id = $1", stop_id)
        if not exists:
            raise HTTPException(404, "stop not found")
    return [dict(r) for r in rows]
