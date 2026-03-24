# Travel Tracker

Family travel tracking app — flights, airports, miles, and travel stats for 2-4 family members.

## Tech Stack

- **Next.js 16** (App Router, React 19, Turbopack)
- **TypeScript** (strict mode)
- **PostgreSQL** (standalone, accessed via `postgres` / postgres.js)
- **oauth2-proxy** (authentication, sits in front of the app)
- **Tailwind CSS v4** + **shadcn/ui v4** (Base UI, not Radix)
- **OurAirports dataset** (~40K airports with trigram search)

## Project Structure

```
src/
  app/
    (app)/                     # Auth-guarded layout group
      dashboard/               # Stats dashboard
      flights/                 # Flight list, new, [id] detail, [id]/edit
      visits/                  # Visit list, new, [id]/edit
      family/                  # Family member management
      map/                     # Flight map view
    api/airports/search/       # Airport autocomplete endpoint (GET ?q=)
    api/locations/suggest/     # Location autocomplete for visits
  actions/                     # Server actions: family.ts, flights.ts, visits.ts
  components/
    ui/                        # shadcn/ui base components (DO NOT edit manually)
    airports/                  # airport-combobox (debounced search)
    flights/                   # flight-form, flight-card, passenger-select, delete-flight-button
    visits/                    # visit-form, visit-card
    family/                    # member-form, member-card, member-detail-content
    dashboard/                 # stats-grid, member-stats-card
    maps/                      # flight-map, visit-map (Leaflet)
    shared/                    # confirm-dialog, empty-state
  lib/
    db.ts                      # Postgres connection pool (postgres.js)
    auth.ts                    # getUserId() — reads oauth2-proxy headers
    types/database.ts          # All TypeScript types (Airport, Flight, Visit, etc.)
    haversine.ts               # Distance calculation (client-side)
    flight-routes.ts           # Flight map data transformation
    geo-mappings.ts            # Country/state code mappings
  hooks/                       # use-airport-search (debounced)
  middleware.ts                # Auth check via oauth2-proxy headers
supabase/migrations/           # SQL migration files + standalone-schema.sql
scripts/                       # Import/export scripts (excluded from TS build)
```

## Git Conventions

This repo uses **release-please** for automated versioning. Commit messages MUST follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <description>
```

### Types
- `feat:` — New feature (→ minor version bump)
- `fix:` — Bug fix (→ patch version bump)
- `feat!:` or `fix!:` or `BREAKING CHANGE:` in body — Breaking change (→ major bump)
- `chore:` — Maintenance, deps, config (no version bump)
- `docs:` — Documentation only (no version bump)
- `refactor:` — Code change that neither fixes nor adds (no version bump)
- `test:` — Adding or updating tests (no version bump)
- `ci:` — CI/CD changes (no version bump)

### Rules
- After completing and verifying a task, create a commit with the appropriate prefix
- The description should explain **why**, not just what (the diff shows what)
- Keep the first line under 72 characters
- Multi-file changes get a single commit unless they're logically separate
- If a task adds a feature AND fixes a bug, use `feat:` (the higher bump wins)

### Deploy Flow
Push to main → release-please opens a Release PR → merge it → tag created → GH Actions builds Docker image → GHCR → Watchtower deploys on Unraid.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build (validates TypeScript)
npm run lint         # ESLint
npx tsx scripts/import-airports.ts   # Import airport data (requires DATABASE_URL)
npx tsx scripts/export-supabase-data.ts  # Export data from Supabase (one-time migration)
```

## Architecture Decisions

- **Single user model** — One user (identified by APP_USER_ID) owns all data. Family members are data records, not auth users. Auth handled by oauth2-proxy.
- **Direct SQL via postgres.js** — No ORM. Tagged template literals for all queries (`sql\`SELECT ...\``). Connection pool managed by postgres.js.
- **oauth2-proxy authentication** — App runs behind oauth2-proxy which handles login. App reads `x-forwarded-email` header. DEV_USER_ID env var for local dev without proxy.
- **Server Components for reads, Client Components for forms** — Dashboard, flight list, detail pages are server components. Forms and comboboxes are client components.
- **Server Actions for all mutations** — API routes only for GET endpoints (airport search, location suggest).
- **Distance stored on flight row** — Computed via Haversine at write time, stored in `distance_miles`.
- **Airport search is server-side** — 40K airports too large for client. Trigram GIN index gives fast fuzzy search.
- **shadcn/ui v4 uses Base UI** — No `asChild` prop. Use `render` prop for composition. Native HTML selects preferred over Base UI Select for form compatibility.

## Database

6 tables + 1 view. Standalone schema in `supabase/migrations/standalone-schema.sql`.

| Table | Notes |
|-------|-------|
| airports | ~40K rows, trigram search index, public reference data |
| family_members | user_id scoped |
| flights | CHECK: commercial requires airline+flight_number |
| flight_passengers | Junction table with role (passenger/pilot/copilot), CASCADE delete |
| visits | Non-flight travel (road trips, cruises) |
| visit_members | Junction table, CASCADE delete |
| member_stats (VIEW) | UNIONs flight airports + visits for per-member stats |

## Environment Variables

```
DATABASE_URL=                  # PostgreSQL connection string
APP_USER_ID=                   # UUID of the app owner (from original Supabase auth)
DEV_USER_ID=                   # Same UUID, used for local dev without oauth2-proxy
```

## Conventions

- Path alias: `@/*` maps to `src/*`
- Server actions use `"use server"` directive, get user via `getUserId()` from `@/lib/auth`
- Forms use native FormData with `action` prop, hidden inputs for complex state (JSON passengers, airport IDs)
- Revalidation via `revalidatePath()` after mutations
- Components use shadcn/ui primitives from `@/components/ui/`
- SQL queries use postgres.js tagged templates with type annotations for component props
- Multi-step mutations wrapped in transactions via `transaction()` helper from `@/lib/db`
