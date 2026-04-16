---
task: Build unified delta import pipeline from spec
slug: 20260416-130000_build-delta-import-pipeline
effort: advanced
phase: execute
progress: 0/28
mode: interactive
started: 2026-04-16T13:00:00-07:00
updated: 2026-04-16T13:00:30-07:00
---

## Context

Implementing the delta import pipeline designed in `docs/delta-import-pipeline-spec.md`. Three data sources (ForeFlight GA flights, Flighty commercial flights, Apple Photos visits) need unified import with watermark tracking, dedup, and consistent CLI interface.

Existing scripts at `scripts/import-foreflight.ts`, `scripts/import-flighty.ts`, `scripts/import-photos-visits-v2.ts` contain proven parsing/mapping logic to port. App uses postgres.js (`src/lib/db.ts`), existing scripts use Supabase client — migration needed.

### Risks
- postgres.js tagged templates behave differently from Supabase query builder — careful porting required
- ForeFlight CSV has complex two-section format — must preserve Aircraft Table + Flights Table parsing
- Airport lookup chains differ (ForeFlight: ICAO ident; Flighty: IATA code) — must keep separate
- Passenger fuzzy matching is inherently lossy — preserve existing matching logic exactly

### Plan
1. Create `import_runs` migration (013)
2. Create `scripts/lib/db.ts` for script-specific postgres connection
3. Create shared types and adapter interface at `scripts/lib/types.ts`
4. Build CLI entry point `scripts/import.ts`
5. Build ForeFlight adapter (port from existing script)
6. Build Flighty adapter (port from existing script)
7. Build Photos adapter (port from existing v2 script)
8. Create `scripts/extract-photos.sh`
9. Update standalone-schema.sql
10. Build verification via --dry-run

## Criteria

### Infrastructure
- [ ] ISC-1: Migration 013 creates import_runs table with correct schema
- [ ] ISC-2: standalone-schema.sql includes import_runs table
- [ ] ISC-3: scripts/lib/db.ts exports postgres.js connection using DATABASE_URL
- [ ] ISC-4: scripts/lib/types.ts defines ImportAdapter interface

### CLI Framework
- [ ] ISC-5: scripts/import.ts parses source argument (foreflight|flighty|photos)
- [ ] ISC-6: CLI supports --file flag for explicit file path
- [ ] ISC-7: CLI supports --dry-run flag
- [ ] ISC-8: CLI supports --full flag to ignore watermark
- [ ] ISC-9: CLI supports --verbose flag
- [ ] ISC-10: File discovery checks ~/travel-imports/ with correct patterns
- [ ] ISC-11: Import engine creates import_runs record at start
- [ ] ISC-12: Import engine updates import_runs on completion

### ForeFlight Adapter
- [ ] ISC-13: Parses two-section CSV (Aircraft Table + Flights Table)
- [ ] ISC-14: Skips simulator aircraft (AATD EquipType)
- [ ] ISC-15: Airport lookup with ident match + K-prefix fallback
- [ ] ISC-16: Dedup key matches existing: (date, dep_airport, arr_airport, tail_number)
- [ ] ISC-17: Passenger linkage via fuzzy name matching
- [ ] ISC-18: Watermark filtering skips rows before last import date

### Flighty Adapter
- [ ] ISC-19: Parses standard CSV with all field mappings
- [ ] ISC-20: Skips cancelled flights
- [ ] ISC-21: Airport lookup by IATA code
- [ ] ISC-22: Dedup key matches existing: (date, dep_airport, arr_airport, airline, flight_number)
- [ ] ISC-23: Enum mappings for seat_type, cabin_class, flight_reason

### Photos Adapter
- [ ] ISC-24: Parses JSON with owner/lat/lng/date/city/state/country fields
- [ ] ISC-25: Clusters into city-day groups with 3-photo minimum
- [ ] ISC-26: Enforces min-gap-days between same-city visits
- [ ] ISC-27: Member linkage via owner→family_members name match

### Extraction
- [ ] ISC-28: scripts/extract-photos.sh exists with osxphotos extraction logic

## Decisions

## Verification
