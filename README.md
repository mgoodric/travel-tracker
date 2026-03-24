# Travel Tracker

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Family travel tracking app for logging flights, visits, airports, miles, and travel stats across 2-4 family members. Self-hosted with Docker.

## Features

- **Flight logging** -- commercial and general aviation with airline, flight number, aircraft type, seat, cabin class, and booking reference
- **Visit tracking** -- non-flight travel (road trips, cruises) with city/state/country and automatic geocoding
- **Family members** -- assign passengers and roles (passenger, pilot, copilot) to each flight or visit
- **Interactive maps** -- Leaflet-powered flight route map and visit pin map with per-category color coding
- **Dashboard** -- aggregate stats (total flights, miles, airports, countries), per-member breakdowns, and recent flight feed
- **Member detail pages** -- per-person flight/visit history, choropleth maps for visited states and countries, filterable lists
- **Airport search** -- fuzzy search across ~40,000 airports (OurAirports dataset) with trigram index
- **Location autocomplete** -- cascading country/state/city suggestions from your visit history

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Next.js 16](https://nextjs.org) (App Router, React 19, Turbopack) |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL with [postgres.js](https://github.com/porsager/postgres) |
| Auth | [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/) (reverse proxy) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui v4](https://ui.shadcn.com) |
| Maps | [Leaflet](https://leafletjs.com) via [react-leaflet](https://react-leaflet.js.org) |
| Deploy | Docker on [Unraid](https://unraid.net) via [Watchtower](https://containrrr.dev/watchtower/) |
| CI/CD | GitHub Actions (release-please, CodeQL, Trivy, GHCR) |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 20+
- [PostgreSQL](https://www.postgresql.org) 15+ (with `pg_trgm` extension)
- [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/) (for production auth) or the `DEV_USER_ID` env var for local development

### Setup

1. **Clone and install dependencies**

   ```bash
   git clone https://github.com/mgoodric/travel-tracker.git
   cd travel-tracker
   npm install
   ```

2. **Create the database**

   ```bash
   createdb travel_tracker
   psql travel_tracker < supabase/migrations/standalone-schema.sql
   ```

3. **Import airport data**

   ```bash
   export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/travel_tracker
   npx tsx scripts/import-airports.ts
   ```

4. **Configure environment variables**

   Create a `.env.local` file:

   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5432/travel_tracker
   APP_USER_ID=<your-uuid>
   DEV_USER_ID=<your-uuid>
   ```

   Generate a UUID for `APP_USER_ID` (e.g., `uuidgen` on macOS/Linux) -- this identifies the single owner of all data.

5. **Start the dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `APP_USER_ID` | Yes (prod) | UUID of the app owner -- used when oauth2-proxy provides a valid session |
| `DEV_USER_ID` | Dev only | UUID fallback when oauth2-proxy is not running |

## Docker Deployment

The app ships as a minimal Alpine-based Docker image published to GitHub Container Registry.

### Pull and run

```bash
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/travel_tracker \
  -e APP_USER_ID=your-uuid \
  ghcr.io/mgoodric/travel-tracker:latest
```

### Build locally

```bash
docker build -t travel-tracker .
```

### Production with oauth2-proxy

In production, place [oauth2-proxy](https://oauth2-proxy.github.io/oauth2-proxy/) in front of the app. The app reads the `X-Forwarded-Email` header set by oauth2-proxy to identify the authenticated user. No in-app login page is needed.

### Automated deploys

Push to `main` triggers [release-please](https://github.com/googleapis/release-please) which opens a release PR. Merging that PR tags a release, builds a Docker image, and pushes to GHCR. [Watchtower](https://containrrr.dev/watchtower/) on Unraid automatically pulls new images.

## Database

6 tables, 1 view. Schema in [`supabase/migrations/standalone-schema.sql`](supabase/migrations/standalone-schema.sql).

| Table | Description |
|-------|-------------|
| `airports` | ~40K airports from OurAirports with trigram search index |
| `family_members` | Family members scoped to a single user |
| `flights` | Flight log with commercial/GA category, airport references, distance |
| `flight_passengers` | Junction table linking flights to family members with roles |
| `visits` | Non-flight travel log with geocoded coordinates |
| `visit_members` | Junction table linking visits to family members |
| `member_stats` | Materialized view aggregating per-member flight and visit statistics |

## Development

```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build (validates TypeScript)
npm run lint         # ESLint
```

### Architecture

- **Server Components** for all data-fetching pages (dashboard, lists, detail views)
- **Client Components** for interactive forms and map widgets
- **Server Actions** for all mutations (create/update/delete flights, visits, family members)
- **Direct SQL** via postgres.js tagged template literals -- no ORM
- **Haversine distance** computed at write time and stored on the flight row

## License

This project is licensed under the [MIT License](LICENSE).
