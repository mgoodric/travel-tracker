# Travel Tracker

Family travel tracking app — flights, airports, miles, and travel stats for 2-4 family members.

## Tech Stack

- **Next.js 16** (App Router, React 19, Turbopack)
- **TypeScript** (strict mode)
- **Supabase** (PostgreSQL, Auth, Row Level Security)
- **Tailwind CSS v4** + **shadcn/ui v4** (Base UI, not Radix)
- **OurAirports dataset** (~40K airports with trigram search)

## Project Structure

```
src/
  app/
    (auth)/login/              # Login/signup page
    (auth)/auth/callback/      # Supabase auth callback
    (app)/                     # Auth-guarded layout group
      dashboard/               # Stats dashboard
      flights/                 # Flight list, new, [id] detail, [id]/edit
      visits/                  # Visit list, new, [id]/edit
      family/                  # Family member management
    api/airports/search/       # Airport autocomplete endpoint (GET ?q=)
  actions/                     # Server actions: family.ts, flights.ts, visits.ts
  components/
    ui/                        # shadcn/ui base components (DO NOT edit manually)
    airports/                  # airport-combobox (debounced search)
    flights/                   # flight-form, flight-card, passenger-select, delete-flight-button
    visits/                    # visit-form, visit-card
    family/                    # member-form, member-card
    dashboard/                 # stats-grid, member-stats-card
    shared/                    # confirm-dialog, empty-state
  lib/
    supabase/                  # client.ts (browser), server.ts (server), middleware.ts
    types/database.ts          # All TypeScript types + Supabase Database type
    haversine.ts               # Distance calculation (client-side)
  hooks/                       # use-airport-search (debounced)
  middleware.ts                # Auth session refresh + redirect
supabase/migrations/           # 8 ordered SQL migration files
scripts/import-airports.ts     # OurAirports CSV import script
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
npx tsx scripts/import-airports.ts   # Import airport data (requires SUPABASE_SERVICE_ROLE_KEY)
```

## Architecture Decisions

- **Single auth user model** — One Supabase auth user owns all data. Family members are data records, not auth users.
- **Server Components for reads, Client Components for forms** — Dashboard, flight list, detail pages are server components. Forms and comboboxes are client components.
- **Server Actions for all mutations** — Only API route is `/api/airports/search` (needs GET with query params).
- **Distance stored on flight row** — Computed via Haversine at write time, stored in `distance_miles`.
- **Airport search is server-side** — 40K airports too large for client. Trigram GIN index gives fast fuzzy search.
- **shadcn/ui v4 uses Base UI** — No `asChild` prop. Use `render` prop for composition. Native HTML selects preferred over Base UI Select for form compatibility.
- **No Database generic on Supabase client** — supabase-js v2.98 type format incompatible with manual Database type. Types defined in `database.ts` for app-level use.

## Database

6 tables + 1 view. Migrations in `supabase/migrations/` numbered 001-008.

| Table | RLS | Notes |
|-------|-----|-------|
| airports | No (public reference data) | ~40K rows, trigram search index |
| family_members | By user_id | |
| flights | By user_id | CHECK: commercial requires airline+flight_number, departure != arrival |
| flight_passengers | Via flight ownership | Junction table with role (passenger/pilot/copilot) |
| visits | By user_id | Non-flight travel (road trips, cruises) |
| visit_members | Via visit ownership | Junction table |
| member_stats (VIEW) | N/A | UNIONs flight airports + visits for per-member stats |

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=       # Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # Supabase anon/public key
SUPABASE_SERVICE_ROLE_KEY=      # Only for import script (never in client code)
```

## Conventions

- Path alias: `@/*` maps to `src/*`
- Server actions use `"use server"` directive, get user via `createClient()` + `getUser()`, redirect to `/login` if unauthenticated
- Forms use native FormData with `action` prop, hidden inputs for complex state (JSON passengers, airport IDs)
- Revalidation via `revalidatePath()` after mutations
- Components use shadcn/ui primitives from `@/components/ui/`
