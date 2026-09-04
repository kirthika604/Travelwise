#!/bin/sh
# Runs once at container init (after 01_schema.sql, alphabetically), still
# as the postgres superuser. Creates a least-privilege role for the API to
# actually connect as: every route in app/ only ever SELECTs (confirmed —
# there is no INSERT/UPDATE/DELETE anywhere in app/), so the app has no
# business holding superuser/owner privileges on this database at runtime.
set -e

APP_DB_PASSWORD="${APP_DB_PASSWORD:?APP_DB_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_readonly') THEN
            CREATE ROLE app_readonly LOGIN PASSWORD '$APP_DB_PASSWORD';
        ELSE
            ALTER ROLE app_readonly WITH PASSWORD '$APP_DB_PASSWORD';
        END IF;
    END
    \$\$;

    GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO app_readonly;
    GRANT USAGE ON SCHEMA public, transit TO app_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO app_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA transit TO app_readonly;

    -- so tables added by future migrations are readable without editing
    -- this script again
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO app_readonly;
    ALTER DEFAULT PRIVILEGES IN SCHEMA transit GRANT SELECT ON TABLES TO app_readonly;
EOSQL
