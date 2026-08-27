"""
Load _poi_chennai.csv and chennaiFood.csv into the `places` table
(+ place_tags, place_cuisines).

Idempotent: re-running upserts by (source, name) and refreshes that
place's tags/cuisines, so you can safely re-run after editing a CSV.

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


def _normalize_key(key: str) -> str:
    """'  Entry_Fee ' / 'entry fee' / '\\ufeffEntry_Fee' -> 'entry_fee'."""
    return key.strip().lstrip('\ufeff').lower().replace(' ', '_')


class Row:
    """
    Wraps one csv.DictReader row so field lookups (r['Entry_Fee']) are
    tolerant of whitespace, a leading BOM, and casing differences in the
    CSV's header row — all common when a CSV has been hand-edited or
    re-saved from Excel/Sheets. A genuinely missing column still raises
    KeyError, but with the actual header names listed so it's obvious
    what to fix, instead of a bare "KeyError: 'Entry_Fee'".
    """

    def __init__(self, raw: dict):
        self._raw = raw
        self._lookup = {
            _normalize_key(k): (v if v is not None else '')
            for k, v in raw.items()
            if k is not None
        }

    def __getitem__(self, key):
        norm = _normalize_key(key)
        if norm in self._lookup:
            return self._lookup[norm]
        available = ', '.join(sorted(k for k in self._raw.keys() if k))
        raise KeyError(
            f"Column '{key}' not found in this CSV. "
            f"Available columns: {available}"
        )

    def get(self, key, default=None):
        try:
            return self[key]
        except KeyError:
            return default


def _read_rows(path):
    # utf-8-sig strips a leading byte-order-mark if present (common when a
    # CSV has been saved from Excel on Mac/Windows) — without this, a BOM
    # silently attaches itself to the *first* header name and every lookup
    # of that column fails with a KeyError that looks like the column is
    # simply missing.
    with open(path, encoding='utf-8-sig') as f:
        lines = f.readlines()

    if not lines:
        raise ValueError(f"{path} is empty")

    reader = csv.DictReader(lines)
    fieldnames = reader.fieldnames or []
    non_empty_fields = [f for f in fieldnames if f and f.strip()]

    # Sheets/Excel exports sometimes carry a leftover title/sheet-name line
    # above the real header row (e.g. '_poi_chennai,,,,,,,,,,,,' — one real
    # value plus a run of trailing blank columns from empty cells). If what
    # we parsed as the header has at most one *non-blank* column, that's
    # almost certainly not real column headers — skip that line and
    # re-parse from the next one.
    if len(non_empty_fields) <= 1 and len(lines) > 1:
        print(
            f"Note: {path}'s first line ({lines[0].strip()!r}) doesn't look "
            f"like a header row — skipping it and reading headers from the "
            f"next line instead."
        )
        reader = csv.DictReader(lines[1:])
        fieldnames = reader.fieldnames or []
        non_empty_fields = [f for f in fieldnames if f and f.strip()]

    if len(non_empty_fields) <= 1:
        raise ValueError(
            f"Couldn't find a real, multi-column header row in {path} "
            f"(only found: {fieldnames}). Open the file and check it's "
            f"actually comma-separated, with the column headers on the "
            f"first non-title line."
        )

    return [Row(r) for r in reader]


def load_poi(conn, path):
    rows = _read_rows(path)

    cur = conn.cursor()
    n = 0
    for r in rows:
        entry_min, entry_max = parse_numeric_range(r['Entry_Fee'])
        avg_min, avg_max = parse_numeric_range(r['Avg_Expense'])
        time_min, time_max = parse_time_needed(r['Time_Needed_hr'])
        times_of_day, season = parse_best_time(r['Best_Time_to_Visit'])
        vibes = split_multi(r['Category/Vibe'])
        # primary category = first vibe tag (there's no separate category column in this file)
        category = vibes[0] if vibes else 'Uncategorised'

        cur.execute("""
            INSERT INTO places (
                source, name, description, category, budget_level,
                entry_fee_min, entry_fee_max, avg_expense_min, avg_expense_max,
                time_needed_min_hr, time_needed_max_hr, time_needed_raw,
                best_time_of_day, best_season, best_time_raw,
                rating, image_url, location_url, lat, lon
            )             VALUES (
                'poi', %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s,
                %s::time_of_day[], %s, %s,
                NULL, %s, %s, %s, %s
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
                image_url = EXCLUDED.image_url,
                location_url = EXCLUDED.location_url,
                lat = EXCLUDED.lat,
                lon = EXCLUDED.lon,
                updated_at = now()
            RETURNING id
        """, (
            r['Place name'].strip(), r['Description'].strip(), category, r['Budget_Level'].strip() or None,
            entry_min, entry_max, avg_min, avg_max,
            time_min, time_max, r['Time_Needed_hr'].strip(),
            times_of_day or None, season, r['Best_Time_to_Visit'].strip(),
            (r.get('Image_URL') or '').strip() or None,
            (r.get('Location_URL') or '').strip() or None,
            float(r['Latitude']), float(r['Longitude']),
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
    print(f"POI: upserted {n} places from {path}")


def load_food(conn, path):
    rows = _read_rows(path)

    cur = conn.cursor()
    n = 0
    for r in rows:
        cuisines = split_multi(r['Cuisine'])
        ambience = split_multi(r['Ambience'])

        cur.execute("""
            INSERT INTO places (
                source, name, description, category, budget_level,
                rating, image_url, location_url, lat, lon
            ) VALUES (
                'food', %s, NULL, %s, %s,
                %s, %s, %s, %s, %s
            )
            ON CONFLICT (source, name) DO UPDATE SET
                category = EXCLUDED.category,
                budget_level = EXCLUDED.budget_level,
                rating = EXCLUDED.rating,
                image_url = EXCLUDED.image_url,
                location_url = EXCLUDED.location_url,
                lat = EXCLUDED.lat,
                lon = EXCLUDED.lon,
                updated_at = now()
            RETURNING id
        """, (
            r['Name'].strip(), r['Category'].strip(), r['Budget'].strip() or None,
            float(r['Rating']) if r['Rating'].strip() else None,
            (r.get('Image_URL') or '').strip() or None,
            (r.get('Location_URL') or '').strip() or None,
            float(r['Latitude']), float(r['Longitude']),
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
    print(f"Food: upserted {n} places from {path}")


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
