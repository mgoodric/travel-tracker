# Plan: Replace Supabase with Standalone PostgreSQL + oauth2-proxy

## Context

The travel-tracker app currently depends on hosted Supabase for both data access (`@supabase/supabase-js`, `@supabase/ssr`) and authentication (Supabase Auth with email/password). The goal is to fully decouple from Supabase by:
1. Replacing the Supabase JS client with direct PostgreSQL access via `postgres` (postgres.js)
2. Removing Supabase Auth entirely — oauth2-proxy sits in front of the app and handles authentication via forwarded headers

This affects **22 source files** (3 server actions, 12 pages, 2 API routes, 1 middleware, 1 layout, 1 login page, 1 auth callback, 1 utility).

---

## Implementation

### Phase 1: Foundation

**Install dependency:**
```bash
npm install postgres
```

**Create `src/lib/db.ts`** — Shared Postgres connection pool:
```typescript
import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL!)
export default sql
```

**Create `src/lib/auth.ts`** — Read user identity from oauth2-proxy headers:
- Read `x-forwarded-email` from `headers()`
- Fall back to `DEV_USER_ID` env var for local dev without oauth2-proxy
- Return the known `APP_USER_ID` env var (single-user app, existing UUID stays in data)

**Create `supabase/migrations/standalone-schema.sql`** — Consolidated schema from all 12 migrations:
- Remove `REFERENCES auth.users(id)` → keep `user_id UUID NOT NULL`
- Remove all `ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` statements
- Inline ALTER TABLEs from migrations 009, 010, 012 into CREATE TABLE definitions
- Preserve: pg_trgm extension, enums, indexes, generated `search_text` column, haversine function, `member_stats` view (from 011)

**Create `scripts/export-supabase-data.ts`** — Export data via Supabase service role key:
- Export tables in FK order: family_members → flights → flight_passengers → visits → visit_members
- Skip airports (re-import via existing `import-airports.ts`)
- Generate SQL INSERT statements

### Phase 2: Server Actions (3 files, parallelizable)

All follow the same transformation:
- `createClient()` + `supabase.auth.getUser()` → `getUserId()` from `src/lib/auth.ts`
- Supabase query builder → postgres.js tagged template SQL
- Multi-step mutations (create/update flight, create/update visit) wrapped in `sql.begin()` transactions
- `redirect("/login")` on auth failure → `throw new Error('Not authenticated')`

**Files:**
- `src/actions/flights.ts` (4 functions) — airport lookup for distance + flight insert/update + passenger junction
- `src/actions/family.ts` (3 functions) — simple CRUD
- `src/actions/visits.ts` (4 functions) — geocode helper stays unchanged, visit CRUD + member junction

### Phase 3: Pages + API Routes (15 files, parallelizable)

**Supabase relationship syntax → SQL JOINs.** Example:
```
supabase.from("flights").select("*, departure_airport:airports!departure_airport_id(*)")
→
sql`SELECT f.*, to_jsonb(da) as departure_airport FROM flights f JOIN airports da ON da.id = f.departure_airport_id`
```

**Pages to rewrite (by complexity):**

| File | Query Pattern |
|------|--------------|
| `flights/new/page.tsx` | Simple: `SELECT * FROM family_members` |
| `visits/new/page.tsx` | Simple: same |
| `family/page.tsx` | Two queries: family_members + member_stats view |
| `map/page.tsx` | Flights + 2 airport JOINs |
| `visits/page.tsx` | Visits + members via visit_members junction |
| `visits/[id]/page.tsx` | Single visit + member JOINs |
| `visits/[id]/edit/page.tsx` | Visit + visit_members + family_members |
| `flights/page.tsx` | Flights + 2 airport JOINs + passengers through junction |
| `flights/[id]/page.tsx` | Single flight + airports + passengers with member details |
| `flights/[id]/edit/page.tsx` | Flight + airports + passenger IDs + family_members |
| `dashboard/page.tsx` | 3 parallel queries: member_stats, flights for map, recent flights |
| `family/[id]/page.tsx` | Most complex: member flights via junction + member visits via junction |

**API routes:**
- `api/airports/search/route.ts` → `WHERE search_text ILIKE ${'%'+q+'%'} OR ident = ${q.toUpperCase()} ORDER BY type LIMIT 10`
- `api/locations/suggest/route.ts` → `SELECT DISTINCT field FROM visits WHERE ...` (3 conditional branches, validated field name to prevent injection)

**Utility:**
- `src/lib/flight-routes.ts` — Remove `FLIGHT_MAP_SELECT` constant (Supabase syntax). Keep `transformFlightsToRoutes()` and types as-is.

### Phase 4: Auth + Cleanup

**Rewrite `src/middleware.ts`:**
- Check for `x-forwarded-email` header (or `DEV_USER_ID` env)
- Return 401 if missing, otherwise `NextResponse.next()`
- Delete `src/lib/supabase/middleware.ts`

**Rewrite `src/app/(app)/layout.tsx`:**
- Remove Supabase auth check (oauth2-proxy + middleware handle this)
- Change `signOut` action → redirect to `/oauth2/sign_out`

**Delete files:**
- `src/lib/supabase/client.ts`, `server.ts`, `middleware.ts` (entire directory)
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/auth/callback/route.ts`

**Update `src/lib/types/database.ts`:**
- Remove `Database` interface (Supabase-specific, lines 111-221)
- Keep all app-level interfaces (Airport, Flight, Visit, etc.)

**Update config files:**
- `package.json`: `npm uninstall @supabase/ssr @supabase/supabase-js`
- `.env.local`: Replace Supabase vars with `DATABASE_URL`, `APP_USER_ID`, `DEV_USER_ID`
- `Dockerfile`: Replace Supabase placeholder env vars with `DATABASE_URL=postgresql://placeholder`
- `CLAUDE.md`: Update tech stack, env vars, architecture docs

---

## Key Design Decisions

1. **`postgres` (postgres.js)** over Drizzle/Prisma — lightweight tagged template SQL, no ORM, matches project simplicity
2. **`APP_USER_ID` env var** — single-user app, avoids needing a users table or email-to-UUID lookup on every request
3. **`DEV_USER_ID` fallback** — enables local dev without oauth2-proxy running
4. **Sign-out** → redirect to `/oauth2/sign_out` (oauth2-proxy's built-in endpoint)
5. **No transition shim** — rewrite all files at once on a feature branch rather than gradual migration (only 22 files)

---

## Verification

1. `npm run build` — TypeScript compilation succeeds with zero errors
2. `grep -r "@supabase" src/` — returns zero matches
3. Run standalone schema SQL against a test Postgres instance — all tables, indexes, views create successfully
4. Run export script against Supabase — generates valid INSERT statements
5. Import data into local Postgres, start app with `DATABASE_URL` pointing to it, verify dashboard loads
