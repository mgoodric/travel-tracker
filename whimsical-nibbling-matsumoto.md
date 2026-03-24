# Travel Tracker — Web MVP Implementation Plan

## Context

Family travel tracking app inspired by Flighty (commercial flight logging) and ForeFlight (GA flight tracking with passenger manifests). Tracks flights, airports visited, miles flown, and travel stats for 2-4 family members. This session builds the Next.js web MVP with Supabase backend. SwiftUI iOS app deferred to a future session.

## Tech Stack

- **Next.js 14+ (App Router)** — TypeScript, React Server Components
- **Supabase** — PostgreSQL, Auth, Row Level Security
- **Tailwind CSS + shadcn/ui** — UI components
- **OurAirports dataset** — ~40K airports including GA, downloaded from GitHub CSV

## Database Schema

### 6 Tables + 1 View

1. **airports** — Static reference data, no RLS
   - `id` (SERIAL PK), `ident` (ICAO, UNIQUE), `iata_code` (nullable), `name`, `latitude`, `longitude`, `elevation_ft`, `type` (large/medium/small_airport, heliport, seaplane_base), `municipality`, `iso_country`, `iso_region`
   - Generated `search_text` column with trigram GIN index for fast fuzzy search
   - Requires `pg_trgm` extension

2. **family_members** — User's family, RLS by `user_id`
   - `id` (UUID PK), `user_id` (FK auth.users), `name`, `relationship`, `created_at`, `updated_at`

3. **flights** — Flight log, RLS by `user_id`
   - `id` (UUID PK), `user_id` (FK auth.users), `category` (ENUM: commercial | general_aviation)
   - Commercial fields: `airline`, `flight_number`
   - GA fields: `aircraft_type`, `tail_number`
   - Shared: `departure_airport_id` (FK), `arrival_airport_id` (FK), `departure_date`, `distance_miles`, `notes`
   - CHECK constraint: commercial requires airline + flight_number
   - CHECK constraint: departure != arrival airport

4. **flight_passengers** — Junction table, RLS via flight ownership
   - `flight_id` (FK), `family_member_id` (FK), `role` (passenger/pilot/copilot)
   - UNIQUE on (flight_id, family_member_id)

5. **visits** — Non-flight travel log (road trips, cruises, etc.), RLS by `user_id`
   - `id` (UUID PK), `user_id` (FK auth.users), `visit_date` (DATE), `city` (nullable), `state` (nullable), `country`, `notes` (nullable)
   - Captures places visited that aren't tied to flights

6. **visit_members** — Junction table linking visits to family members
   - `visit_id` (FK), `family_member_id` (FK)
   - UNIQUE on (visit_id, family_member_id)

7. **member_stats** (VIEW) — Aggregated stats per family member
   - flight_count, total_miles, unique countries/states/cities/airports
   - Countries/states/cities UNIONed from both flight airports AND visits table

### Haversine Function
PostgreSQL function `haversine_miles(lat1, lon1, lat2, lon2)` for distance calculation. Also implemented in TypeScript for client-side preview.

## Project Structure

```
~/Development/travel-tracker/
├── supabase/migrations/          # 8 SQL migration files
├── scripts/import-airports.ts    # OurAirports CSV → Supabase bulk insert
├── src/
│   ├── app/
│   │   ├── (auth)/login/         # Login page + auth callback
│   │   ├── (app)/                # Auth-guarded layout group
│   │   │   ├── dashboard/        # Stats dashboard (server component)
│   │   │   ├── flights/          # Flight list, new, [id] detail, [id]/edit
│   │   │   ├── visits/           # Non-flight travel log, new, [id]/edit
│   │   │   └── family/           # Family member management
│   │   └── api/airports/search/  # GET ?q= airport autocomplete endpoint
│   ├── actions/                  # Server actions: flights.ts, family.ts, visits.ts
│   ├── components/
│   │   ├── ui/                   # shadcn/ui base components
│   │   ├── flights/              # flight-card, flight-form, passenger-select
│   │   ├── visits/               # visit-card, visit-form, member-select
│   │   ├── airports/             # airport-combobox (debounced search)
│   │   ├── family/               # member-card, member-form
│   │   ├── dashboard/            # stats-grid, member-stats, recent-flights
│   │   └── shared/               # empty-state, confirm-dialog, loading
│   ├── lib/
│   │   ├── supabase/             # client.ts, server.ts (browser + server clients)
│   │   ├── haversine.ts          # Distance calculation
│   │   └── types/                # Database types + app aliases
│   └── hooks/                    # use-airport-search (debounced)
```

## Key Architectural Decisions

1. **Airport search: server-side API route** — 40K airports too large for client bundle. Trigram GIN index gives <10ms fuzzy search. Debounced combobox at 200ms.

2. **Server Components for reads, Client Components for forms** — Dashboard, flight list, flight detail are server components (direct Supabase queries). Flight form and airport combobox are client components.

3. **Server Actions for all mutations** — createFlight, updateFlight, deleteFlight, addMember, etc. Type-safe, auto-revalidation via `revalidatePath`. Only API route is airport search (needs GET with query params).

4. **Distance stored on flight row** — Computed via Haversine at write time, stored in `distance_miles`. Avoids joining airports on every stats query.

5. **Single auth user model** — One Supabase auth user (family owner) manages all data. Family members are data records, not auth users.

6. **Airport data: OurAirports CSV** — Download from `https://davidmegginson.github.io/ourairports-data/airports.csv`. Import script parses CSV, filters out closed airports, bulk inserts. ~40K rows, 12.5MB CSV.

## Implementation Order

### Phase 1: Project Scaffold (ISC 1-5)
1. `npx create-next-app@latest` with TypeScript, Tailwind, App Router
2. Install shadcn/ui, configure base components (button, card, input, dialog, combobox, date-picker, select, table, badge, popover)
3. Install `@supabase/supabase-js`, `@supabase/ssr`
4. Create Supabase client utilities (browser + server)
5. Configure ESLint + Prettier
6. Set up `.env.local` template

### Phase 2: Database Schema (ISC 6-18)
1. Write all SQL migration files in `supabase/migrations/`
2. Include pg_trgm extension, all tables, constraints, indexes, RLS policies, Haversine function, stats view

### Phase 3: Airport Data (ISC 19-24)
1. Create `scripts/import-airports.ts` — fetches OurAirports CSV, parses, bulk inserts
2. Create `/api/airports/search` route with trigram query
3. Build `airport-combobox` component with debounced search

### Phase 4: Family Members (ISC 25-28)
1. Server actions for family CRUD
2. Family page with member cards, add/edit dialog, delete confirmation

### Phase 5: Flight Entry (ISC 29-37)
1. Flight form component (conditional commercial/GA fields)
2. Passenger selector with role assignment
3. Server actions for flight CRUD with Haversine distance calc
4. Flight list page with date-sorted cards
5. Flight detail page

### Phase 6: Visits / Non-Flight Travel (ISC 38-44)
1. Server actions for visit CRUD (create, update, delete)
2. Visit form: date, country, state (optional), city (optional), notes, member selector
3. Visit list page sorted by date
4. Country/state autocomplete or standardized dropdowns (ISO codes)

### Phase 7: Dashboard (ISC 45-51)
1. Stats queries — flights + visits UNIONed for countries/states/cities per member
2. Dashboard page with stats grid and member breakdown
3. Separate flight stats (count, miles) and travel stats (countries, states, cities from all sources)

## Verification

1. `npm run build` succeeds with no TypeScript errors
2. All pages render: `/dashboard`, `/flights`, `/flights/new`, `/visits`, `/visits/new`, `/family`
3. Airport combobox returns results for "JFK", "KAUS", "Austin"
4. Flight form submits with both commercial and GA categories
5. Family member CRUD works (add, edit, delete with confirmation)
6. Dashboard shows correct stats per member
7. Distance calculated correctly (JFK→LAX ≈ 2,475 miles)
8. SQL migrations are valid and create all tables with proper constraints/RLS
