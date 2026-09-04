-- Creates a least-privilege `app_readonly` role for the API to connect as
-- instead of the postgres superuser. Every route in app/ only ever SELECTs
-- (there is no INSERT/UPDATE/DELETE anywhere in app/), so the running app
-- has no business holding write/DDL privileges on this database.
--
-- (docker-compose sets this up automatically via db/init/02_restrict_permissions.sh
-- on first container init — only run this by hand for a non-Docker local
-- Postgres setup, or to (re)apply it against an existing database.)
--
-- Run with:
--   psql -d chennai_explore -v app_db_password='changeme' -f db/migrations/003_restrict_permissions.sql

\if :{?app_db_password}
\else
    \echo 'ERROR: pass -v app_db_password=<password>'
    \quit 1
\endif

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_readonly') THEN
        CREATE ROLE app_readonly LOGIN PASSWORD :'app_db_password';
    ELSE
        ALTER ROLE app_readonly WITH PASSWORD :'app_db_password';
    END IF;
END
$$;

GRANT CONNECT ON DATABASE chennai_explore TO app_readonly;
GRANT USAGE ON SCHEMA public, transit TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA transit TO app_readonly;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA transit GRANT SELECT ON TABLES TO app_readonly;
