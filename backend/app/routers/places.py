from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..database import get_pool
from ..schemas import PlaceDetail, PlaceSummary, NearbyStop

router = APIRouter(prefix="/places", tags=["places"])


@router.get("", response_model=list[PlaceSummary])
async def list_places(
    source: Optional[str] = Query(None, pattern="^(poi|food)$"),
    category: Optional[str] = None,
    budget_level: Optional[str] = Query(None, pattern="^(Low|Medium|High)$"),
    tag: Optional[str] = Query(None, description="matches place_tags.tag (vibe or ambience)"),
    cuisine: Optional[str] = None,
    min_rating: Optional[float] = None,
    max_time_hr: Optional[float] = Query(
        None, description="only places whose typical visit fits within this many hours"
    ),
    best_time_of_day: Optional[str] = Query(None, pattern="^(Morning|Afternoon|Evening|Night|Sunrise|Daytime|Anytime)$"),
    near_lat: Optional[float] = None,
    near_lon: Optional[float] = None,
    radius_km: Optional[float] = Query(None, description="required if near_lat/near_lon given"),
    limit: int = Query(50, le=200),
    offset: int = 0,
):
    """
    Search places by any combination of the user's stated constraints.
    If near_lat/near_lon are given, results are sorted by distance and
    distance_km is populated; otherwise sorted by name.
    """
    if (near_lat is None) != (near_lon is None):
        raise HTTPException(400, "near_lat and near_lon must be given together")

    where = []
    args = []

    def add(cond, val):
        args.append(val)
        where.append(cond.format(n=len(args)))

    if source:
        add("p.source = ${n}", source)
    if category:
        add("p.category ILIKE ${n}", category)
    if budget_level:
        add("p.budget_level = ${n}", budget_level)
    if min_rating is not None:
        add("p.rating >= ${n}", min_rating)
    if max_time_hr is not None:
        add("(p.time_needed_max_hr IS NULL OR p.time_needed_max_hr <= ${n})", max_time_hr)
    if best_time_of_day:
        add("${n} = ANY(p.best_time_of_day)", best_time_of_day)
    if tag:
        args.append(tag)
        where.append(f"EXISTS (SELECT 1 FROM place_tags t WHERE t.place_id = p.id AND t.tag ILIKE ${len(args)})")
    if cuisine:
        args.append(cuisine)
        where.append(f"EXISTS (SELECT 1 FROM place_cuisines c WHERE c.place_id = p.id AND c.cuisine ILIKE ${len(args)})")

    near_select, order_by = "", "p.name"
    if near_lat is not None:
        if radius_km is None:
            raise HTTPException(400, "radius_km is required when near_lat/near_lon are given")
        args.append(near_lon)
        lon_n = len(args)
        args.append(near_lat)
        lat_n = len(args)
        pt = f"ST_SetSRID(ST_MakePoint(${lon_n}, ${lat_n}), 4326)::geography"
        near_select = f", ST_Distance(p.location, {pt}) / 1000.0 AS distance_km"
        args.append(radius_km * 1000)
        where.append(f"ST_DWithin(p.location, {pt}, ${len(args)})")
        order_by = "distance_km"

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    args.append(limit)
    limit_n = len(args)
    args.append(offset)
    offset_n = len(args)

    sql = f"""
        SELECT p.id, p.source, p.name, p.category, p.budget_level, p.rating,
               p.lat, p.lon {near_select}
        FROM places p
        {where_sql}
        ORDER BY {order_by}
        LIMIT ${limit_n} OFFSET ${offset_n}
    """

    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *args)
    return [dict(r) for r in rows]


@router.get("/{place_id}", response_model=PlaceDetail)
async def get_place(place_id: int):
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM places WHERE id = $1", place_id)
        if not row:
            raise HTTPException(404, "place not found")
        tags = await conn.fetch(
            "SELECT tag FROM place_tags WHERE place_id = $1 AND tag_type = 'vibe'", place_id
        )
        ambience = await conn.fetch(
            "SELECT tag FROM place_tags WHERE place_id = $1 AND tag_type = 'ambience'", place_id
        )
        cuisines = await conn.fetch(
            "SELECT cuisine FROM place_cuisines WHERE place_id = $1", place_id
        )

    d = dict(row)
    d["tags"] = [r["tag"] for r in tags] + [r["tag"] for r in ambience]
    d["cuisines"] = [r["cuisine"] for r in cuisines]
    return d


@router.get("/{place_id}/nearby-stops", response_model=list[NearbyStop])
async def nearby_stops(place_id: int, radius_m: float = 1200, limit: int = 10):
    """
    Nearest transit stops (any mode) to a place — the building block for
    'how do I get there' routing. Groups by stop and lists which routes
    serve it, so the client can immediately show 'Bus 21G, 5 min walk'.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        place = await conn.fetchrow("SELECT location FROM places WHERE id = $1", place_id)
        if not place:
            raise HTTPException(404, "place not found")

        rows = await conn.fetch(
            """
            SELECT s.stop_id, s.stop_name, s.lat, s.lon,
                   ST_Distance(s.location, p.location) AS distance_m,
                   COALESCE(
                       ARRAY_AGG(DISTINCT COALESCE(r.route_short_name, r.route_long_name))
                           FILTER (WHERE COALESCE(r.route_short_name, r.route_long_name) IS NOT NULL),
                       ARRAY[]::text[]
                   ) AS route_short_names,
                   COALESCE(
                       ARRAY_AGG(DISTINCT r.route_type) FILTER (WHERE r.route_type IS NOT NULL),
                       ARRAY[]::smallint[]
                   ) AS modes
            FROM places p
            JOIN transit.stops s ON ST_DWithin(s.location, p.location, $2)
            JOIN transit.stop_times st ON st.stop_id = s.stop_id
            JOIN transit.trips t ON t.trip_id = st.trip_id
            JOIN transit.routes r ON r.route_id = t.route_id
            WHERE p.id = $1
            GROUP BY s.stop_id, s.stop_name, s.lat, s.lon, s.location, p.location
            ORDER BY distance_m
            LIMIT $3
            """,
            place_id, radius_m, limit,
        )
    return [dict(r) for r in rows]
