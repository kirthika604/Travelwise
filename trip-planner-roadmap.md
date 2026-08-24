# Trip Planner App — Full Roadmap & Tech Plan

Based on your PRD: a platform that filters destinations by user constraints, combines them into feasible itineraries, and plans multi-modal transport routes with time-based availability.

---

## 1. Break the Product Into 3 Engines

Your PRD is really three separate systems wearing one UI. Naming them helps you build in the right order:

| Engine | Job |
|---|---|
| **Discovery Engine** | Filter/rank places by user constraints (interest, budget, time, distance) |
| **Combination Engine** | Group multiple destinations into a feasible day/trip plan |
| **Routing Engine** | Multi-modal transport between those destinations, time-aware |

Build in this order: Discovery → Combination → Routing → Real-time/Nav polish. Each is usable on its own, which keeps you from having a half-broken everything for months.

---

## 2. Recommended Tech Stack

### Frontend
- **Framework**: Next.js (React) — SSR helps with map-heavy pages and SEO for place pages
- **Styling**: Tailwind CSS + shadcn/ui (fast, consistent, customizable)
- **Animation**: Framer Motion (page/section transitions, list reordering when filters change), Lottie for small delight animations (loading states, empty states)
- **Maps (frontend)**: Mapbox GL JS (better custom styling + route animation than Google Maps JS SDK) or Google Maps JS SDK if you want tighter Places integration
- **State/data fetching**: TanStack Query (React Query) for API calls + caching, Zustand for lightweight client state

### Backend (you've already decided)
- **FastAPI** (Python) — good choice, async-friendly for calling multiple external APIs concurrently
- **Pydantic** for request/response validation
- **Celery + Redis** (later phase) for background jobs — e.g., precomputing rankings, refreshing transit data

### Database
- **PostgreSQL** + **PostGIS extension** — non-negotiable for this app. You're doing geospatial queries (nearby places, distance filters, route bounding boxes) constantly; PostGIS makes these fast and simple instead of hand-rolled haversine math
- **Redis** — cache frequently requested place data and transit schedules (avoid hammering external APIs)

### Auth
- **Clerk** or **Auth0** for fastest setup with OAuth (Google/Apple login expected by users), or **FastAPI-Users** + JWT if you want to own the whole stack yourself

### Hosting
- **Frontend**: Vercel (native Next.js support)
- **Backend**: Railway or Render early on (simple, cheap); move to AWS (ECS/Fargate) or GCP Cloud Run once you need scale
- **DB**: Supabase or Neon (managed Postgres with PostGIS support) early; RDS later

---

## 3. APIs & Data Sources (the hard part of your PRD)

This is where most of your engineering risk lives — pick these carefully.

### Places / Destination data
- **Google Places API** — richest data (photos, ratings, opening hours, reviews), but paid and rate-limited
- **OpenTripMap API** — free, decent POI/attraction data, good starting point for MVP
- **Foursquare Places API** — good alternative/supplement, generous free tier
- **OpenStreetMap (via Overpass API)** — free, community data, great for filling gaps but inconsistent quality

*Recommendation*: Start with OpenTripMap + OSM for MVP (free), layer in Google Places later for production-quality data once you have paying users to justify the API cost.

### Transit / Multi-modal routing
This is your hardest technical problem — be honest with yourself about scope here.
- **Google Directions API / Routes API** — supports driving, walking, transit, bicycling; easiest to integrate but costs money at scale and transit coverage varies by country
- **OpenRouteService** — free, open-source, supports multi-modal routing, self-hostable
- **GTFS (General Transit Feed Specification)** — most cities publish free GTFS data for their public transit; you'd ingest this yourself for real schedule-based routing. Libraries: `gtfs-kit` (Python) to parse/query GTFS
- **OpenTripPlanner (OTP)** — open-source, self-hosted multi-modal trip planner that consumes GTFS + OSM data directly. This is genuinely the most realistic path for real multi-modal + time-based transit planning without paying Google per-request. Worth serious consideration since your PRD leans heavily on this.

*Recommendation*: MVP uses Google Directions API (fast to integrate, "good enough" routing). Once validated, migrate the routing engine to self-hosted OpenTripPlanner + local GTFS feeds — that's the only way to get accurate time-based public transit planning without an unsustainable API bill.

### Real-time location
- Browser Geolocation API (frontend) — no external service needed for basic "user's current location"
- **Mapbox/Google Geocoding API** for reverse geocoding (coordinates → address)

### Maps for navigation display
- **Mapbox Directions + Navigation SDK** or Google Maps — for turn-by-turn visual navigation
- If budget-constrained: **Leaflet.js** (free, open-source) + OSM tiles for basic map display, upgrade to Mapbox later for polish

---

## 4. Recommendation / Ranking Logic

Your "rank-based destination selection" NFR needs an actual algorithm, not just filtering:

1. **Filter first** (hard constraints): budget, distance radius, category, time available
2. **Score remaining candidates** on a weighted formula: relevance to stated interest, rating/popularity, distance from user, time-fit (does it fit in the available window)
3. **Combination step**: this is a constrained optimization problem — think of it like a mini version of the traveling salesman problem with time windows. For MVP, don't over-engineer: use a greedy nearest-neighbor + time-budget check. Save true optimization (e.g., using `Google OR-Tools` for constraint solving) for V2 once you see real usage patterns.

---

## 5. UI/UX Design Process (before you touch code)

1. **Figma** — wireframe the core flows first: constraint input → results list/map → itinerary builder → route view. Don't skip wireframes; this app has a lot of state (filters, selections, route steps) and it's cheap to fix in Figma, expensive to fix in React.
2. **Design system first**: define your color palette, type scale, spacing, and component states (loading/empty/error) before building screens — this is what makes "vibe coding" prompts to Claude/Cursor/v0 produce consistent results instead of a different look per screen.
3. **Reference points for this kind of app**: Google Maps (route clarity), Airbnb (place browsing/filtering UX), Citymapper (multi-modal transit UX — genuinely study this one closely, it's solved a lot of what you're building)

---

## 6. Suggested Build Roadmap (Phased)

### Phase 0 — Foundation (1–2 weeks)
- Set up repo, FastAPI skeleton, Postgres + PostGIS, Next.js skeleton
- Figma wireframes for core flows
- Pick and get API keys for one places data source (start with OpenTripMap, it's free)

### Phase 1 — Discovery Engine (2–3 weeks)
- User constraint input form (interest, budget, time, radius)
- Backend endpoint: filter + rank places from your data source
- Frontend: results list + basic map view (Leaflet or Mapbox)
- This alone is a demoable MVP

### Phase 2 — Combination Engine (2 weeks)
- Let user select multiple places → generate a feasible itinerary order (greedy algorithm)
- Time-budget validation ("this won't fit in your 4 hours")

### Phase 3 — Routing Engine (3–4 weeks, hardest phase)
- Integrate Google Directions API for MVP multi-modal routes between itinerary stops
- Display route on map with step-by-step directions
- Time-based availability check against transit schedules

### Phase 4 — Auth, Real-time location, Polish (2 weeks)
- Add auth (Clerk/Auth0)
- Real-time geolocation as a constraint input
- Animation pass: page transitions, loading skeletons, micro-interactions (Framer Motion)

### Phase 5 — V2: Self-hosted transit routing
- Migrate to OpenTripPlanner + local GTFS feeds for real public-transit accuracy
- Add OR-Tools based optimization for combination engine
- Caching layer (Redis) for performance at scale

---

## 7. A Few Honest Flags

- **Multi-modal + time-based transit planning is the single hardest part of this PRD.** It's the reason apps like Citymapper have entire dedicated teams. Budget real time for Phase 3/5 — don't let it become an afterthought.
- **API costs will bite you** if you go straight to Google Places + Google Directions at scale. Start free (OSM/OpenTripMap/OpenTripPlanner), prove demand, then upgrade to paid APIs for quality.
- **Don't build the recommendation algorithm and the routing algorithm in the same sprint.** They're both non-trivial; keep them decoupled services so you can iterate on each independently.

---

## 8. Suggested "Vibe Coding" Prompt Starter for This Project

Once you're ready to generate UI screens, something like:

> Build the results screen for a trip-planning app. Aesthetic: clean, modern, like Citymapper meets Airbnb — trustworthy but not sterile. Layout: left panel with filter controls (interest tags, budget slider, radius), right panel split between a scrollable ranked list of place cards and a live Mapbox map showing pins. Each place card shows photo, name, category tag, distance, and a "fits your time" badge. Animate list reordering with Framer Motion when filters change (staggered fade). Empty state: friendly illustration + "try widening your radius." Loading: skeleton cards, not spinners. Fully responsive — map collapses below the list on mobile. Stack: Next.js, Tailwind, shadcn/ui, Framer Motion.
