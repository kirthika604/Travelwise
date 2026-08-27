from typing import Any

import asyncpg


class DiscoveryRepository:

    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool

    async def get_candidate_places(
        self,
        budget: str | None = None,
        available_hours: float | None = None,
        latitude: float | None = None,
        longitude: float | None = None,
        radius_km: float | None = None,
        preferred_time: str | None = None,
        source: str | None = None,
    ) -> list[asyncpg.Record]:

        conditions: list[str] = []
        values: list[Any] = []
        index = 1

        # Budget hard constraint
        if budget:
            conditions.append(
                f"p.budget_level::text = ${index}"
            )
            values.append(budget)
            index += 1

        # Time hard constraint:
        # place minimum required time should fit user's available time
        if available_hours is not None:
            conditions.append(
                f"""
                (
                    p.time_needed_min_hr IS NULL
                    OR p.time_needed_min_hr <= ${index}
                )
                """
            )
            values.append(available_hours)
            index += 1

        # Source: poi or food
        if source:
            conditions.append(
                f"p.source::text = ${index}"
            )
            values.append(source)
            index += 1

        # Preferred time
        if preferred_time:
            conditions.append(
                f"""
                (
                    p.best_time_of_day IS NULL
                    OR ${index}::time_of_day = ANY(p.best_time_of_day)
                    OR 'Anytime'::time_of_day = ANY(p.best_time_of_day)
                )
                """
            )
            values.append(preferred_time)
            index += 1

        # Location/radius hard constraint
        distance_select = "NULL::double precision AS distance_km"

        if (
            latitude is not None
            and longitude is not None
            and radius_km is not None
        ):
            distance_select = f"""
                ST_Distance(
                    p.location,
                    ST_SetSRID(
                        ST_MakePoint(${index}, ${index + 1}),
                        4326
                    )::geography
                ) / 1000.0 AS distance_km
            """

            # longitude first because ST_MakePoint(x, y)
            values.append(longitude)
            values.append(latitude)

            conditions.append(
                f"""
                ST_DWithin(
                    p.location,
                    ST_SetSRID(
                        ST_MakePoint(${index}, ${index + 1}),
                        4326
                    )::geography,
                    ${index + 2}
                )
                """
            )

            values.append(radius_km * 1000)
            index += 3

        where_clause = ""

        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        query = f"""
            SELECT
                p.id,
                p.name,
                p.source::text AS source,
                p.description,
                p.category,
                p.budget_level::text AS budget_level,

                p.entry_fee_min,
                p.entry_fee_max,
                p.avg_expense_min,
                p.avg_expense_max,

                p.time_needed_min_hr,
                p.time_needed_max_hr,

                COALESCE(
                    ARRAY(
                        SELECT unnest(p.best_time_of_day)::text
                    ),
                    ARRAY[]::text[]
                ) AS best_time_of_day,

                p.rating,
                p.image_url,
                p.location_url,
                p.lat,
                p.lon,

                {distance_select},

                COALESCE(
                    ARRAY(
                        SELECT DISTINCT pt.tag
                        FROM place_tags pt
                        WHERE pt.place_id = p.id
                    ),
                    ARRAY[]::text[]
                ) AS tags,

                COALESCE(
                    ARRAY(
                        SELECT DISTINCT pc.cuisine
                        FROM place_cuisines pc
                        WHERE pc.place_id = p.id
                    ),
                    ARRAY[]::text[]
                ) AS cuisines

            FROM places p
            {where_clause}
        """

        async with self.pool.acquire() as connection:
            rows = await connection.fetch(query, *values)

        return rows