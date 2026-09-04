# Deploying TravelWise (Vercel + Render)

Two independent deploys: the Next.js frontend on Vercel, the FastAPI backend
+ Postgres on Render. The frontend never calls the backend directly from the
browser — `next.config.mjs` proxies `/api/*` server-side to `BACKEND_ORIGIN`,
so there's no CORS to configure either side.

## 1. Backend — Render

1. **New Postgres** (Render dashboard → New → PostgreSQL). Once it's up, open
   its psql shell (or connect locally with the external connection string)
   and enable the extensions the schema needs:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   CREATE EXTENSION IF NOT EXISTS pg_trgm;
   ```
2. **Load the schema and data**, from your machine, pointed at Render's
   external DB URL (found on the Postgres instance's page):
   ```bash
   psql "<render-external-connection-string>" -f "data/backend_fixed 7/db/schema.sql"

   cd "data/backend_fixed 7/db/etl 4"
   python3 load_places.py \
     --poi "../../../poi_new.csv" \
     --food "../../../chennaiFood_new.csv" \
     --dsn "<render-external-connection-string>"

   python3 load_gtfs.py --dsn "<render-external-connection-string>"  # check --help for its actual flags
   ```
3. **New Web Service** (Render dashboard → New → Web Service → your repo,
   Environment: Docker). Set:
   - **Root Directory**: `data/backend_fixed 7`
   - **Dockerfile Path**: `Dockerfile` (relative to that root)
   - **Port**: `8000` (matches the Dockerfile's `CMD`)
   - **Env var** `DATABASE_URL` → the Postgres **internal** connection string
     (same dashboard, same instance — internal is faster and free of
     external-connection limits)
4. Once it deploys, note the public URL Render gives you
   (`https://<something>.onrender.com`) — you'll need it for step 2.3 below.
   Sanity check: `curl https://<that-url>/health` should return
   `{"status":"healthy"}`.

Render's free-tier Postgres is deleted after 30 days unless upgraded — fine
for a demo link, not for anything you want to still work in two months.

## 2. Frontend — Vercel

1. **New Project** from the repo. Vercel auto-detects Next.js — the only
   non-default setting is:
   - **Root Directory**: `frontend 3`
2. **Environment variables** (Project Settings → Environment Variables),
   same names as `frontend 3/.env.local.example`:
   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | from Supabase → Project Settings → API |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page |
   | `BACKEND_ORIGIN` | the Render URL from step 1.4 (no trailing slash) |
   | `NEXT_PUBLIC_USE_MOCK` | `0` |
3. Deploy. First load will be a cold start on Render's free tier (~30–50s if
   the backend's been idle) — the app's live/mock fallback means a slow or
   failed first request just silently shows mock data instead of an error,
   so don't be alarmed if the very first visit looks a little generic before
   a refresh picks up the real data.

## 3. Post-deploy checklist

- [ ] Supabase Auth → URL Configuration: add the Vercel domain to
      **Redirect URLs** (needed for auth to work from the deployed domain,
      not just localhost).
- [ ] Sign up a real test account on the deployed URL and confirm a
      check-in saves and the level card appears.
- [ ] Confirm `/discover` shows the "Live API" badge, not "Mock" — if it
      says Mock, `BACKEND_ORIGIN` is wrong or the Render service is asleep/erroring.
- [ ] Delete this `poi-check@travelwise.dev`-style test accounts you make
      along the way — same as we've been doing throughout development.
