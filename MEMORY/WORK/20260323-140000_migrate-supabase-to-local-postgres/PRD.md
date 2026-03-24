---
task: Replace Supabase with standalone Postgres and oauth2-proxy
slug: 20260323-140000_migrate-supabase-to-local-postgres
effort: advanced
phase: complete
progress: 28/28
mode: interactive
started: 2026-03-23T14:00:00-05:00
updated: 2026-03-23T14:15:00-05:00
---

## Context

User wants to fully decouple from Supabase (hosted). Two parallel changes:
1. **Data layer**: Replace Supabase JS client with direct PostgreSQL driver (`postgres` / pg). All server actions, page data fetching, and API routes currently use `@supabase/supabase-js` and `@supabase/ssr`.
2. **Auth layer**: Remove Supabase Auth entirely. App runs behind oauth2-proxy which handles authentication. App trusts proxy headers (`X-Forwarded-User`, `X-Forwarded-Email`, etc.).

### What was requested
- Migrate data from Supabase to local Postgres instance
- Use oauth2-proxy for auth instead of Supabase Auth

### What was NOT requested
- Schema changes or new features
- ORM adoption (keep it lightweight)
- Changes to the frontend UI components

### Key constraints
- Single auth user model — one user owns all data, family members are data records
- 12 SQL migration files define the schema
- ~40K airports with trigram search index
- oauth2-proxy sits in front of the app, so no login page needed in-app
- Docker deployment to Unraid via Watchtower

### Risks
- Migrations reference `auth.users(id)` FK and `auth.uid()` in RLS — must create standalone schema without these
- `member_stats` view is pure SQL (no auth.uid()) — safe to reuse as-is
- Supabase's query builder syntax (`.from().select().eq()`) is deeply embedded — every server action and page uses it
- The `.select()` with relationship joins (e.g., `departure_airport:airports!departure_airport_id(*)`) must be replicated with SQL JOINs
- Airport trigram search currently uses Supabase `.or()` — needs raw SQL
- RLS policies won't exist in standalone Postgres — app must enforce ownership filtering
- Data export from Supabase requires pg_dump access or API-based export
- user_id values (UUIDs from Supabase Auth) are foreign keys throughout the data

## Criteria

- [x] ISC-1: Data export script dumps all Supabase tables to SQL
- [x] ISC-2: Export includes airports, family_members, flights, flight_passengers, visits, visit_members
- [x] ISC-3: Migration SQL files run cleanly on standalone Postgres
- [x] ISC-4: `postgres` (postgres.js) package installed as dependency
- [x] ISC-5: `src/lib/db.ts` exports a shared Postgres connection pool
- [x] ISC-6: `DATABASE_URL` env var configures Postgres connection
- [x] ISC-7: `getUser()` helper reads user identity from oauth2-proxy headers
- [x] ISC-8: Middleware trusts oauth2-proxy headers instead of Supabase session
- [x] ISC-9: `flights.ts` server actions use direct SQL queries
- [x] ISC-10: `family.ts` server actions use direct SQL queries
- [x] ISC-11: `visits.ts` server actions use direct SQL queries
- [x] ISC-12: Dashboard page fetches data via direct SQL
- [x] ISC-13: Flights list page fetches data via direct SQL with JOIN
- [x] ISC-14: Visits list page fetches data via direct SQL with JOIN
- [x] ISC-15: Family page fetches data via direct SQL
- [x] ISC-16: Flight detail page fetches with airport and passenger JOINs
- [x] ISC-17: Visit detail page fetches with member JOINs
- [x] ISC-18: Flight edit page fetches existing flight data via SQL
- [x] ISC-19: Visit edit page fetches existing visit data via SQL
- [x] ISC-20: Airport search API uses raw SQL with trigram/ILIKE
- [x] ISC-21: Location suggest API uses direct SQL
- [x] ISC-22: Login page removed or replaced with auth-not-needed redirect
- [x] ISC-23: Auth callback route removed
- [x] ISC-24: `@supabase/ssr` and `@supabase/supabase-js` removed from dependencies
- [x] ISC-25: `src/lib/supabase/` directory removed
- [x] ISC-26: `.env.local` updated with DATABASE_URL instead of Supabase vars
- [x] ISC-27: `npm run build` succeeds with no TypeScript errors
- [x] ISC-28: Dockerfile does not reference Supabase placeholder env vars
- [x] ISC-A-1: No Supabase imports remain in src/ directory
- [x] ISC-A-2: No hardcoded user IDs in application code

## Decisions

- 2026-03-23 14:02: Chose `postgres` (postgres.js) over Drizzle/Prisma — lightweight, no ORM, matches project's simplicity
- 2026-03-23 14:02: Auth via oauth2-proxy headers — no in-app login needed
- 2026-03-23 14:02: Keep user_id in schema but derive from oauth2-proxy header for ownership filtering
