# Chennai Explore — backend

Postgres + PostGIS database and a FastAPI service for:
1. **places** — the POIs (`_poi_chennai.csv`) and food spots (`chennaiFood.csv`) users can explore, searchable by their constraints (budget, category/vibe, time available, cuisine, rating, distance...).
2. **transit** — the bus + metro + suburban train GTFS feed built earlier (`chennai-multimodal-gtfs.zip`), so a place's nearest stops and their departure times can be looked up.

> **Note on how this was built:** I don't have a live database or network access
> in this sandbox, so none of this has been run against a real Postgres —
> everything is written and syntax-checked, and the CSV-parsing logic was
> dry-run against your actual data (see `db/etl/parsers.py`), but you'll be
> the first to actually run the schema/loaders/API for real. Please run the
> smoke-test steps below and let me know if anything errors — I'm happy to
> debug from the error message.

## Architecture

```
schema.sql
 ├── public.places, place_tags, place_cuisines, place_opening_hours
 └── transit.agency, routes, calendar, trips, stops, stop_times, frequencies, trip_details

db/etl/
 ├── parsers.py        # cleans the messy range/date fields in the source CSVs
 ├── load_places.py     # loads _poi_chennai.csv + chennaiFood.csv -> places
 └── load_gtfs.py        # loads the merged GTFS feed -> transit.*

app/                    # FastAPI service
 ├── main.py
 ├── database.py         # asyncpg connection pool
 ├── schemas.py           # Pydantic response models
 └── routers/
      ├── places.py       # search/filter/detail + nearby-stops
      └── transit.py      # nearby stops (general) + departures at a stop
```

## Quickstart (Docker)

```bash
cd backend
docker compose up -d db          # starts Postgres+PostGIS, auto-runs schema.sql
pip install -r requirements.txt  # or run inside a venv

# load the two CSVs
python db/etl/load_places.py \
  --poi /path/to/_poi_chennai.csv \
  --food /path/to/chennaiFood.csv \
  --dsn postgresql://kirthika_ck@localhost:5432/chennai


# unzip chennai-multimodal-gtfs.zip somewhere, then load it
unzip chennai-multimodal-gtfs.zip -d /tmp/gtfs
python db/etl/load_gtfs.py \
  --gtfs-dir /tmp/gtfs \
  --dsn postgresql://postgres:postgres@localhost:5432/chennai_explore

# run the API
docker compose up -d api
# or locally: uvicorn app.main:app --reload
```

Then check `http://localhost:8000/docs` for interactive API docs (FastAPI auto-generates these).

## Example queries

```bash
# free/low-budget places, best visited in the evening, near Marina Beach, within 3km
curl "http://localhost:8000/places?budget_level=Low&best_time_of_day=Evening&near_lat=13.05907&near_lon=80.28511&radius_km=3"

# medium-budget cafés with a rooftop/trendy vibe
curl "http://localhost:8000/places?source=food&category=Caf%C3%A9&tag=trendy"

# full details for one place
curl "http://localhost:8000/places/1"

# what transit is near this place, within 1.2km
curl "http://localhost:8000/places/1/nearby-stops"

# next departures from a stop after 09:00 on a weekday
curl "http://localhost:8000/transit/stops/CMRL_13/departures?after=09:00:00&service_id=weekday"
```

## What's here vs. what's next

**Built:**
- Clean, normalized schema for places + full GTFS transit data in one DB
- Idempotent ETL for both CSVs (handles the inconsistent dashes, blank
  fields, and the conflated time-of-day/season column — see the docstring
  in `parsers.py`)
- Search API with the constraint filters your product spec calls out:
  budget, category/vibe, cuisine, rating, time available, best time of day,
  and proximity
- "Nearest transit stop(s) to this place" and "next departures from a stop"
  — the raw building blocks a route planner needs

**Not built yet (next phase):**
- An actual multi-modal **journey planner** (walk → bus → metro → train →
  walk, with transfers, arriving before a deadline). `nearby-stops` +
  `departures` give you the data to do this, but the routing algorithm
  itself (e.g. RAPTOR-style multi-criteria search) is a separate,
  substantial piece of work — happy to scope that next.
- Real opening hours. `place_opening_hours` exists in the schema but is
  empty — the source CSVs only have a coarse "best time of day", not actual
  open/close times, so true time-based availability filtering is
  approximate until that data is sourced.
- Auth, rate limiting, pagination metadata (total counts), and tests —
  none of that's in yet; this is a working core, not production-hardened.

## Data notes / assumptions

- `Time_Needed_hr`: `"2-3 hr"` parses directly; `"Half-day"` → 4–6 hr,
  `"Full-day"` → 7–10 hr. These are estimates (`TIME_NEEDED_MAP` in
  `parsers.py`) — adjust if you have a better convention.
- `Best_Time_to_Visit` mixes time-of-day (`"Morning/Evening"`) and season
  (`"November-February"`, including a source typo "Novenber" which is
  handled). These are split into `best_time_of_day` (structured) and
  `best_season` (free text) — the original string is kept in
  `best_time_raw` either way.
- A POI's `category` is taken as the first tag in `Category/Vibe` (the CSV
  has no separate category column) — the rest go into `place_tags`.
