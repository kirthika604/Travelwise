-- Adds image_url + location_url to an existing `places` table.
-- Safe to re-run (IF NOT EXISTS) and non-destructive — existing rows just
-- get NULL in the two new columns until the ETL is re-run with the updated
-- CSVs.
--
-- Run with:
--   psql -d chennai_explore -f db/migrations/002_add_place_urls.sql

ALTER TABLE places
    ADD COLUMN IF NOT EXISTS image_url    TEXT,
    ADD COLUMN IF NOT EXISTS location_url TEXT;
