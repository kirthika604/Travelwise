# TravelWise — Frontend

Explore your city by **vibe, budget and time** — then get there by **bus, metro and train**.
A calm, animated Next.js frontend for the TravelWise engines (discovery · combination · routing).

Built to satisfy every requirement in [`Frontend.md`](Frontend.md): four ordered pages
(**Login → Discover → Combination → Routes**), touch-reactive backgrounds, a vibe-based
card carousel, itinerary building, and an animated multimodal route map.

---

## Quick start

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000** — you'll land on the Login page.

> The app works **with or without the backend running**. If the API is unreachable it
> transparently falls back to built-in sample data (17 real Chennai places) so every page
> and animation is fully demoable. A small pill in the top bar shows **Live API** vs **Sample data**.

### With the real backend

The FastAPI backend has **no CORS**, so the browser never calls it directly. Next.js proxies
`/api/*` to the backend (see `next.config.mjs`), keeping everything same-origin.

1. Start the backend + Postgres (from `data/backend_fixed`, e.g. `docker compose up`) on **:8000**.
2. Copy env and (optionally) point at a different origin:
   ```bash
   cp .env.local.example .env.local
   ```
   ```
   BACKEND_ORIGIN=http://localhost:8000   # where FastAPI is
   NEXT_PUBLIC_USE_MOCK=0                  # 1 = always use sample data
   ```
3. `npm run dev` — discovery/combination/routing now hit the live engines.

---

## The four pages

| # | Route | What it does |
|---|-------|--------------|
| 1 | `/login` | Demo auth + **enable live location**. Calm, touch-reactive WebGL **fluid** background. |
| 2 | `/discover` | Starts with **nearby places grouped by vibe** (horizontal carousels, scroll vertically through vibe types). **Find place** filter: vibe · budget · available time · max distance (optional). Filtered results shown **ranked**. Calm parallax "exploring" background. |
| 3 | `/combination` | Sequences your selected places into **time-aware day plans** connected by transit; pick one. More **active** background. |
| 4 | `/routes` | **Choose a transport combination**, then see the **step-by-step flow** (times, boarding stop, line/service no., wait, fare) beside a **MapLibre map with an animated flowing route** and a moving vehicle marker. |

**Flow:** Discover → pick one place → *Plan route here* → Routes.
Or select several → *Build combination* → Combination → choose a plan → Routes.

---

## Tech & architecture

- **Next.js 14 (App Router) + TypeScript**, **Tailwind CSS**, **Framer Motion**.
- **Zustand** (`lib/trip-store.ts`) holds cross-page trip state, persisted to `sessionStorage`.
- **MapLibre GL** with a free, token-free CARTO dark basemap (no API key needed).
  Override the style with `NEXT_PUBLIC_MAP_STYLE`.
- **Backgrounds:** a WebGL fragment-shader fluid for Login (`FluidCanvas`), and a canvas
  parallax star/aurora field for Discover/Combination (`AuroraField`, `calm` vs `active`).
- **API layer** (`lib/api.ts`) calls the engines through the `/api` proxy with a timeout and a
  **mock fallback** (`lib/mock.ts`) that mirrors the backend's scoring/itinerary/routing logic.
- Fully **keyboard- and reduced-motion-aware**; responsive (drawer on desktop, bottom sheet on mobile).

```
app/            login · discover · combination · routes  (one file per page)
components/     backgrounds · discover · combination · routes · ui
lib/            types · constants · geo · api · mock · route-view · trip-store
```

### Theme
A calm night-sky navy base with a **sunset (voyage)** primary for the joy of exploring,
balanced by a **teal (lagoon)** accent that nods to sustainable transit — deliberately *not*
a green-heavy UI.

---

## Scripts

```bash
npm run dev      # start dev server (http://localhost:3000)
npm run build    # production build
npm run start    # serve the production build
npm run lint     # next lint
```

## Notes
- No account or key is required for the demo; location stays on-device.
- If MapLibre can't reach the CARTO CDN (offline), the rest of the app still works — set
  `NEXT_PUBLIC_MAP_STYLE` to any self-hosted style JSON to run fully offline.
