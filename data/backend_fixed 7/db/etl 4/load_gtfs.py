"""
Load the merged GTFS feed (chennai-multimodal-gtfs.zip, already extracted)
into the `transit` schema. Uses COPY for speed — stop_times.txt alone is
~1.36M rows.

Load order matters (foreign keys): agency -> routes -> calendar -> trips
-> stops -> stop_times -> frequencies -> trip_details.

Usage:
    python db/etl/load_gtfs.py \
        --gtfs-dir /path/to/extracted/chennai-multimodal-gtfs \
        --dsn postgresql://user:pass@localhost:5432/chennai_explore
"""
import argparse
import os

import psycopg2


COPY_STEPS = [
    # (file, table, column list — must match the CSV's own column order)
    ("agency.txt", "transit.agency",
     "agency_id, agency_name, agency_url, agency_timezone, agency_lang"),
    ("routes.txt", "transit.routes",
     "route_id, route_short_name, route_long_name, route_type, agency_id"),
    ("calendar.txt", "transit.calendar",
     "service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday, "
     "start_date, end_date"),
    ("trips.txt", "transit.trips",
     "trip_id, route_id, service_id, direction_id"),
    ("stops.txt", "transit.stops",
     "stop_id, stop_name, lat, lon"),
    ("stop_times.txt", "transit.stop_times",
     "trip_id, arrival_time, departure_time, stop_id, stop_sequence"),
    ("frequencies.txt", "transit.frequencies",
     "trip_id, start_time, end_time, headway_secs, exact_times"),
]

TRIP_DETAILS_FILE = "train_trip_details.csv"


def copy_file(cur, gtfs_dir, filename, table, columns):
    path = os.path.join(gtfs_dir, filename)
    if not os.path.exists(path):
        print(f"skip {filename}: not found in {gtfs_dir}")
        return
    with open(path, 'r', newline='') as f:
        cur.copy_expert(
            f"COPY {table} ({columns}) FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')",
            f,
        )
    print(f"loaded {filename} -> {table}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--gtfs-dir', required=True, help='directory of extracted GTFS .txt files')
    ap.add_argument('--dsn', required=True)
    args = ap.parse_args()

    conn = psycopg2.connect(args.dsn)
    conn.autocommit = False
    try:
        cur = conn.cursor()
        for filename, table, columns in COPY_STEPS:
            copy_file(cur, args.gtfs_dir, filename, table, columns)

        details_path = os.path.join(args.gtfs_dir, TRIP_DETAILS_FILE)
        if os.path.exists(details_path):
            with open(details_path, 'r', newline='') as f:
                cur.copy_expert(
                    "COPY transit.trip_details (trip_id, train_number, service_type) "
                    "FROM STDIN WITH (FORMAT csv, HEADER true, NULL '')",
                    f,
                )
            print(f"loaded {TRIP_DETAILS_FILE} -> transit.trip_details")

        conn.commit()
        print("GTFS load complete.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == '__main__':
    main()
