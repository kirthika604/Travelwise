-- Chennai Explore — database schema
-- Two logical schemas in one database:
--   public   -> places to explore (POIs + food spots) and their constraints
--   transit  -> multi-modal GTFS data (bus / metro / suburban train)
--
-- Run with: psql -d chennai_explore -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy name search

-- ============================================================
-- PLACES (public schema)
-- ============================================================

DO $$ BEGIN
    CREATE TYPE budget_level AS ENUM ('Low','Medium','High');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE place_source AS ENUM ('poi','food');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE time_of_day AS ENUM
        ('Morning','Afternoon','Evening','Night','Sunrise','Daytime','Anytime');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS places (
    id                   SERIAL PRIMARY KEY,
    source               place_source NOT NULL,
    name                 TEXT NOT NULL,
    description          TEXT,
    category             TEXT NOT NULL,          -- e.g. 'Beach', 'Restaurant', 'Café', 'Rooftop'

    budget_level         budget_level,
    entry_fee_min        NUMERIC(10,2),           -- INR, NULL = unknown, 0 = free
    entry_fee_max        NUMERIC(10,2),
    avg_expense_min       NUMERIC(10,2),
    avg_expense_max       NUMERIC(10,2),

    time_needed_min_hr   NUMERIC(4,1),            -- parsed estimate, hours
    time_needed_max_hr   NUMERIC(4,1),
    time_needed_raw      TEXT,                    -- original text, e.g. 'Half-day'

    best_time_of_day     time_of_day[],           -- parsed, e.g. {Morning,Evening}
    best_season          TEXT,                    -- parsed, e.g. 'Nov-Feb' (nullable)
    best_time_raw         TEXT,                    -- original text, kept for audit

    rating               NUMERIC(2,1),            -- food only; NULL for POIs

    lat                  DOUBLE PRECISION NOT NULL,
    lon                  DOUBLE PRECISION NOT NULL,
    location             GEOGRAPHY(Point,4326)
                             GENERATED ALWAYS AS
                             (ST_SetSRID(ST_MakePoint(lon,lat),4326)::geography) STORED,

    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (source, name)
);

CREATE INDEX IF NOT EXISTS idx_places_location   ON places USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_places_category   ON places (category);
CREATE INDEX IF NOT EXISTS idx_places_budget     ON places (budget_level);
CREATE INDEX IF NOT EXISTS idx_places_source     ON places (source);
CREATE INDEX IF NOT EXISTS idx_places_name_trgm  ON places USING GIN (name gin_trgm_ops);

-- multi-valued "vibe" (POI) / "ambience" (food) tags
CREATE TABLE IF NOT EXISTS place_tags (
    place_id   INT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    tag        TEXT NOT NULL,
    tag_type   TEXT NOT NULL DEFAULT 'vibe',   -- 'vibe' | 'ambience'
    PRIMARY KEY (place_id, tag, tag_type)
);
CREATE INDEX IF NOT EXISTS idx_place_tags_tag ON place_tags (tag);

-- cuisines (food only, comma-split)
CREATE TABLE IF NOT EXISTS place_cuisines (
    place_id  INT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    cuisine   TEXT NOT NULL,
    PRIMARY KEY (place_id, cuisine)
);
CREATE INDEX IF NOT EXISTS idx_place_cuisines_cuisine ON place_cuisines (cuisine);

-- structured opening hours — not in the source CSVs yet, but the product spec calls for
-- "time-based availability", so the table is ready for whenever real hours are sourced.
-- Until populated, the API falls back to best_time_of_day for a coarse constraint.
CREATE TABLE IF NOT EXISTS place_opening_hours (
    id            SERIAL PRIMARY KEY,
    place_id      INT NOT NULL REFERENCES places(id) ON DELETE CASCADE,
    day_of_week   SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sunday
    open_time     TIME NOT NULL,
    close_time    TIME NOT NULL,
    UNIQUE (place_id, day_of_week)
);

-- ============================================================
-- TRANSIT (GTFS: bus + metro + suburban train), separate schema
-- ============================================================

CREATE SCHEMA IF NOT EXISTS transit;

CREATE TABLE IF NOT EXISTS transit.agency (
    agency_id        TEXT PRIMARY KEY,
    agency_name      TEXT NOT NULL,
    agency_url       TEXT,
    agency_timezone  TEXT,
    agency_lang      TEXT
);

CREATE TABLE IF NOT EXISTS transit.routes (
    route_id          TEXT PRIMARY KEY,
    route_short_name  TEXT,
    route_long_name   TEXT,
    route_type        SMALLINT,     -- GTFS: 0 tram/metro-tram, 1 subway/metro, 2 rail, 3 bus ...
    agency_id         TEXT REFERENCES transit.agency(agency_id)
);
CREATE INDEX IF NOT EXISTS idx_transit_routes_agency ON transit.routes(agency_id);

CREATE TABLE IF NOT EXISTS transit.calendar (
    service_id  TEXT PRIMARY KEY,
    monday      BOOLEAN NOT NULL,
    tuesday     BOOLEAN NOT NULL,
    wednesday   BOOLEAN NOT NULL,
    thursday    BOOLEAN NOT NULL,
    friday      BOOLEAN NOT NULL,
    saturday    BOOLEAN NOT NULL,
    sunday      BOOLEAN NOT NULL,
    start_date  DATE,
    end_date    DATE
);

CREATE TABLE IF NOT EXISTS transit.trips (
    trip_id       TEXT PRIMARY KEY,
    route_id      TEXT NOT NULL REFERENCES transit.routes(route_id),
    service_id    TEXT NOT NULL REFERENCES transit.calendar(service_id),
    direction_id  SMALLINT
);
CREATE INDEX IF NOT EXISTS idx_transit_trips_route   ON transit.trips(route_id);
CREATE INDEX IF NOT EXISTS idx_transit_trips_service ON transit.trips(service_id);

CREATE TABLE IF NOT EXISTS transit.stops (
    stop_id     TEXT PRIMARY KEY,
    stop_name   TEXT NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    location    GEOGRAPHY(Point,4326)
                    GENERATED ALWAYS AS
                    (ST_SetSRID(ST_MakePoint(lon,lat),4326)::geography) STORED
);
CREATE INDEX IF NOT EXISTS idx_transit_stops_location ON transit.stops USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_transit_stops_name_trgm ON transit.stops USING GIN (stop_name gin_trgm_ops);

-- arrival/departure use INTERVAL rather than TIME, because GTFS allows times past
-- 24:00:00 for post-midnight trips (e.g. 25:30:00) which the TIME type cannot hold.
CREATE TABLE IF NOT EXISTS transit.stop_times (
    trip_id         TEXT NOT NULL REFERENCES transit.trips(trip_id) ON DELETE CASCADE,
    arrival_time    INTERVAL NOT NULL,
    departure_time  INTERVAL NOT NULL,
    stop_id         TEXT NOT NULL REFERENCES transit.stops(stop_id),
    stop_sequence   INT NOT NULL,
    PRIMARY KEY (trip_id, stop_sequence)
);
CREATE INDEX IF NOT EXISTS idx_stop_times_stop   ON transit.stop_times(stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_trip   ON transit.stop_times(trip_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_dep    ON transit.stop_times(departure_time);

-- CMRL-style headway service (metro): trains run every N seconds within a
-- window rather than at fixed stop_times.
CREATE TABLE IF NOT EXISTS transit.frequencies (
    trip_id        TEXT NOT NULL REFERENCES transit.trips(trip_id) ON DELETE CASCADE,
    start_time     INTERVAL NOT NULL,
    end_time       INTERVAL NOT NULL,
    headway_secs   INT NOT NULL,
    exact_times    SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (trip_id, start_time)
);

-- suburban train supplementary info (train number, Fast/MEMU/EMU tag) —
-- not part of core GTFS, but useful for filtering/display
CREATE TABLE IF NOT EXISTS transit.trip_details (
    trip_id       TEXT PRIMARY KEY REFERENCES transit.trips(trip_id) ON DELETE CASCADE,
    train_number  TEXT,
    service_type  TEXT   -- 'EMU/Local' | 'Fast' | 'MEMU'
);
