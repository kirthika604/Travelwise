"""
Load _poi_chennai.csv and chennaiFood.csv into the `places` table
(+ place_tags, place_cuisines).

Idempotent: re-running upserts by (source, name) and refreshes that
place's tags/cuisines, so you can safely re-run after editing a CSV.

Tolerant of the source data's gaps: blank or missing columns become NULL,
and a row without a usable name or coordinates is skipped with a warning
rather than aborting the whole load.

Usage:
    python db/etl/load_places.py \
        --poi /path/to/_poi_chennai.csv \
        --food /path/to/chennaiFood.csv \
        --dsn postgresql://user:pass@localhost:5432/chennai_explore
"""
import argparse
import csv

import psycopg2
import psycopg2.extras

from parsers import parse_numeric_range, parse_time_needed, parse_best_time, split_multi


def text(row, key):
    """Stripped value for `key`, or None when blank/absent."""
    return (row.get(key) or '').strip() or None


def number(row, key):
    """Float value for `key`, or None when blank/absent/unparseable."""
    raw = text(row, key)
    if raw is None:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def coordinates(row, source, line_no):
    lat, lon = number(row, 'Latitude'), number(row, 'Longitude')
    if lat is None or lon is None:
        print(f"skip {source} row {line_no} ({text(row, 'Place name') or text(row, 'Name')!r}): "
              "missing or unparseable coordinates")
        return None
    return lat, lon


def load_poi(conn, path):
    with open(path, encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    cur = conn.cursor()
    n = 0
    for line_no, r in enumerate(rows, start=2):   # 1 is the header
        name = text(r, 'Place name')
        if name is None:
            print(f"skip poi row {line_no}: no name")
            continue
        coords = coordinates(r, 'poi', line_no)
        if coords is None:
            continue
        lat, lon = coords

        entry_min, entry_max = parse_numeric_range(text(r, 'Entry_Fee'))
        avg_min, avg_max = parse_numeric_range(text(r, 'Avg_Expense'))
        time_min, time_max = parse_time_needed(text(r, 'Time_Needed_hr'))
        times_of_day, season = parse_best_time(text(r, 'Best_Time_to_Visit'))
        vibes = split_multi(text(r, 'Category/Vibe'))
        # primary category = first vibe tag (there's no separate category column in this file)
        category = vibes[0] if vibes else 'Uncategorised'

        cur.execute("""
            INSERT INTO places (
                source, name, description, category, budget_level,
                entry_fee_min, entry_fee_max, avg_expense_min, avg_expense_max,
                time_needed_min_hr, time_needed_max_hr, time_needed_raw,
                best_time_of_day, best_season, best_time_raw,
                rating, lat, lon
            )             VALUES (
                'poi', %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s::time_of_day[], %s, %s,
                NULL, %s, %s
            )
            ON CONFLICT (source, name) DO UPDATE SET
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                budget_level = EXCLUDED.budget_level,
                entry_fee_min = EXCLUDED.entry_fee_min,
                entry_fee_max = EXCLUDED.entry_fee_max,
                avg_expense_min = EXCLUDED.avg_expense_min,
                avg_expense_max = EXCLUDED.avg_expense_max,
                time_needed_min_hr = EXCLUDED.time_needed_min_hr,
                time_needed_max_hr = EXCLUDED.time_needed_max_hr,
                time_needed_raw = EXCLUDED.time_needed_raw,
                best_time_of_day = EXCLUDED.best_time_of_day,
                best_season = EXCLUDED.best_season,
                best_time_raw = EXCLUDED.best_time_raw,
                lat = EXCLUDED.lat,
                lon = EXCLUDED.lon,
                updated_at = now()
            RETURNING id
        """, (
            name, text(r, 'Description'), category, text(r, 'Budget_Level'),
            entry_min, entry_max, avg_min, avg_max,
            time_min, time_max, text(r, 'Time_Needed_hr'),
            times_of_day or None, season, text(r, 'Best_Time_to_Visit'),
            lat, lon,
        ))
        place_id = cur.fetchone()[0]

        cur.execute("DELETE FROM place_tags WHERE place_id = %s AND tag_type = 'vibe'", (place_id,))
        psycopg2.extras.execute_values(
            cur,
            "INSERT INTO place_tags (place_id, tag, tag_type) VALUES %s",
            [(place_id, v, 'vibe') for v in vibes],
        )
        n += 1
    conn.commit()
    print(f"POI: upserted {n} of {len(rows)} rows from {path}")


def load_food(conn, path):
    with open(path, encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    cur = conn.cursor()
    n = 0
    for line_no, r in enumerate(rows, start=2):
        name = text(r, 'Name')
        if name is None:
            print(f"skip food row {line_no}: no name")
            continue
        coords = coordinates(r, 'food', line_no)
        if coords is None:
            continue
        lat, lon = coords

        cuisines = split_multi(text(r, 'Cuisine'))
        ambience = split_multi(text(r, 'Ambience'))

        cur.execute("""
            INSERT INTO places (
                source, name, description, category, budget_level,
                rating, lat, lon
            ) VALUES (
                'food', %s, NULL, %s, %s,
                %s, %s, %s
            )
            ON CONFLICT (source, name) DO UPDATE SET
                category = EXCLUDED.category,
                budget_level = EXCLUDED.budget_level,
                rating = EXCLUDED.rating,
                lat = EXCLUDED.lat,
                lon = EXCLUDED.lon,
                updated_at = now()
            RETURNING id
        """, (
            name, text(r, 'Category') or 'Uncategorised', text(r, 'Budget'),
            number(r, 'Rating'),
            lat, lon,
        ))
        place_id = cur.fetchone()[0]

        cur.execute("DELETE FROM place_cuisines WHERE place_id = %s", (place_id,))
        psycopg2.extras.execute_values(
            cur,
            "INSERT INTO place_cuisines (place_id, cuisine) VALUES %s",
            [(place_id, c) for c in cuisines],
        )
        cur.execute("DELETE FROM place_tags WHERE place_id = %s AND tag_type = 'ambience'", (place_id,))
        psycopg2.extras.execute_values(
            cur,
            "INSERT INTO place_tags (place_id, tag, tag_type) VALUES %s",
            [(place_id, a, 'ambience') for a in ambience],
        )
        n += 1
    conn.commit()
    print(f"Food: upserted {n} of {len(rows)} rows from {path}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--poi', required=True)
    ap.add_argument('--food', required=True)
    ap.add_argument('--dsn', required=True, help='postgresql://user:pass@host:port/dbname')
    args = ap.parse_args()

    conn = psycopg2.connect(args.dsn)
    try:
        load_poi(conn, args.poi)
        load_food(conn, args.food)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
