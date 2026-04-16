# Delta Import Pipeline — Design Spec

> **Status:** Draft
> **Date:** 2026-04-16
> **Author:** Matt + PAI

## Problem Statement

Travel data lives in 3 external systems (ForeFlight, Flighty, Apple Photos). Currently, 3 ad-hoc import scripts exist with hardcoded paths, no state tracking, and full-file dedup on every run. Each import requires manual file placement and remembering which script to run. There's no record of when the last import happened or what was imported.

**Goal:** A consistent, repeatable import process that tracks import history per source, computes deltas efficiently, and minimizes manual effort.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  EXTRACTION (per-source, mostly manual trigger)          │
│                                                          │
│  ForeFlight ──► CSV export from iPad/Mac                 │
│  Flighty    ──► CSV export from iOS app                  │
│  Photos     ──► osxphotos CLI (automated) or manual JSON │
└──────────────────────┬──────────────────────────────────┘
                       │ files land in ~/travel-imports/
┌──────────────────────▼──────────────────────────────────┐
│  UNIFIED IMPORT CLI                                      │
│  npx tsx scripts/import.ts <source> [options]             │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────┐    │
│  │  ForeFlight  │  │   Flighty   │  │    Photos    │    │
│  │   Adapter    │  │   Adapter   │  │   Adapter    │    │
│  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘    │
│         └────────────────┼────────────────┘             │
│                    ┌─────▼─────┐                         │
│                    │  Import   │                         │
│                    │  Engine   │                         │
│                    └─────┬─────┘                         │
│                          │ postgres.js                    │
└──────────────────────────┼──────────────────────────────┘
┌──────────────────────────▼──────────────────────────────┐
│  POSTGRESQL                                              │
│  import_runs (audit log + watermark source)               │
│  flights / visits / flight_passengers / visit_members     │
└─────────────────────────────────────────────────────────┘
```

## Key Design Decision: Watermark as Optimization, Not Gate

All 3 sources export **full dumps** — there is no incremental API. Flights can be backdated (logging old flights retroactively in ForeFlight). Therefore:

- **Watermark** = optimization that skips rows with dates before the last import, making re-imports fast
- **Dedup queries** = correctness guarantee that prevents duplicate insertion regardless of watermark
- Both layers run on every import (belt and suspenders)

This means a "full reimport" (ignoring watermark) is always safe — it just takes longer.

---

## 1. Database Schema: `import_runs`

A single table serves as both audit log and watermark source.

```sql
-- Migration: add import_runs table
CREATE TABLE import_runs (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,                    -- 'foreflight' | 'flighty' | 'photos'
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',  -- 'running' | 'completed' | 'failed'
  file_path TEXT,                          -- path to imported file (for audit)
  data_date_min DATE,                      -- earliest date in imported data
  data_date_max DATE,                      -- latest date in imported data
  rows_parsed INTEGER DEFAULT 0,
  rows_inserted INTEGER DEFAULT 0,
  rows_skipped_dedup INTEGER DEFAULT 0,
  rows_skipped_error INTEGER DEFAULT 0,
  watermark_date DATE,                     -- date used as watermark for this run
  notes TEXT,                              -- any warnings or info
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_import_runs_source ON import_runs (source, completed_at DESC);
```

**Watermark query:**
```sql
SELECT MAX(data_date_max) AS last_imported_date
FROM import_runs
WHERE source = $1 AND status = 'completed';
```

**Why this over a separate watermarks table:** You get audit history + state derivation from one table. The watermark is just `MAX(data_date_max)` from successful runs. If a run fails, it doesn't advance the watermark (status stays 'failed'). No separate table to keep in sync.

---

## 2. Unified CLI Entry Point

```
npx tsx scripts/import.ts <source> [options]

Sources:
  foreflight    Import GA flights from ForeFlight CSV
  flighty       Import commercial flights from Flighty CSV
  photos        Import visits from Apple Photos data

Options:
  --file <path>     Path to import file (overrides default location)
  --dry-run         Parse and validate without inserting
  --full            Ignore watermark, process all rows (still deduplicates)
  --min-gap <days>  Photos only: minimum days between visits to same city (default: 30)
  --verbose         Show per-row processing details

Examples:
  npx tsx scripts/import.ts foreflight
  npx tsx scripts/import.ts flighty --file ~/Downloads/FlightyExport-2026-04-15.csv
  npx tsx scripts/import.ts photos --dry-run
  npx tsx scripts/import.ts foreflight --full   # reimport everything, dedup handles safety
```

### File Discovery (Hybrid Strategy)

1. Check `--file` CLI argument first (explicit path always wins)
2. Check `~/travel-imports/` directory for matching files:
   - ForeFlight: `logbook_*.csv` (most recent by mtime)
   - Flighty: `FlightyExport-*.csv` (most recent by mtime)
   - Photos: `photos_*.json` (most recent by mtime)
3. If neither found, print helpful error with expected patterns

```
~/travel-imports/
├── logbook_2026-04-15_10_30_00.csv      # ForeFlight export
├── FlightyExport-2026-04-15.csv         # Flighty export
└── photos_2026-04-15.json               # Photos extraction output
```

---

## 3. Source Adapters

Each adapter implements a common interface:

```typescript
interface ImportAdapter {
  source: 'foreflight' | 'flighty' | 'photos';
  
  // Parse the file and return normalized rows
  parse(filePath: string, watermarkDate: Date | null): Promise<ParseResult>;
  
  // Insert a single row, returning outcome
  importRow(row: NormalizedRow, sql: Sql): Promise<'inserted' | 'skipped_dedup' | 'skipped_error'>;
}

interface ParseResult {
  rows: NormalizedRow[];
  dateMin: Date;
  dateMax: Date;
  skippedBeforeWatermark: number;
}
```

### 3a. ForeFlight Adapter

**Source file:** ForeFlight CSV (two-section format: Aircraft Table + Flights Table)

**Delta strategy:**
1. Query watermark: `MAX(data_date_max) FROM import_runs WHERE source = 'foreflight'`
2. Parse Aircraft Table (always fully — it's small)
3. Parse Flights Table, skip rows where `Date < watermark_date` (unless `--full`)
4. For remaining rows, run dedup query before insert

**Dedup key:** `(departure_date, departure_airport_id, arrival_airport_id, tail_number)`

**Field mapping (preserved from existing script):**

| ForeFlight CSV | DB Column | Notes |
|---|---|---|
| Date | departure_date | YYYY-MM-DD |
| AircraftID | tail_number | Also used for aircraft_type lookup |
| From | departure_airport_id | ICAO ident lookup, with K-prefix fallback |
| To | arrival_airport_id | Same lookup, defaults to From if empty |
| TimeOut | actual_departure | Combined with Date → TIMESTAMPTZ |
| TimeIn | actual_arrival | Combined with Date → TIMESTAMPTZ |
| Distance | distance_miles | NM → SM conversion (x1.15078), Haversine fallback |
| PilotComments | notes | Strip triple-quote wrapping |
| Person1-6 | flight_passengers | Name;Role;Email;Phone → fuzzy match family_members |

**Category:** Always `general_aviation`

**Passenger linkage:** Fuzzy name matching against `family_members` table (case-insensitive substring match, then partial word match). Unmatched names logged as warnings but don't block import.

**Airport resolution chain:**
1. Exact `ident` match in airports table
2. Manual overrides (KFLY→K00V, KMAN→KS67)
3. K-prefix fallback (e.g., `FLY` → `KFLY`)

**Filters:**
- Skip simulator aircraft (EquipType = "AATD")
- Skip coordinate-based departures (contains "°")
- Skip empty departure fields

### 3b. Flighty Adapter

**Source file:** Standard CSV (single header row)

**Delta strategy:**
1. Query watermark: `MAX(data_date_max) FROM import_runs WHERE source = 'flighty'`
2. Parse all rows, skip where `Date < watermark_date` (unless `--full`)
3. For remaining rows, run dedup query before insert

**Dedup key:** `(departure_date, departure_airport_id, arrival_airport_id, airline, flight_number)`

**Field mapping (preserved from existing script):**

| Flighty CSV | DB Column | Notes |
|---|---|---|
| Date | departure_date | YYYY-MM-DD |
| From | departure_airport_id | IATA code lookup |
| To | arrival_airport_id | IATA code lookup |
| Airline | airline | |
| Flight | flight_number | |
| Aircraft Type Name | aircraft_type | |
| Tail Number | tail_number | |
| Seat | seat | |
| Seat Type | seat_type | Enum mapping: WINDOW/MIDDLE/AISLE |
| Cabin Class | cabin_class | Enum mapping |
| Flight Reason | flight_reason | Enum mapping: BUSINESS/LEISURE |
| PNR | booking_reference | |
| Dep Terminal/Gate | departure_terminal/gate | |
| Arr Terminal/Gate | arrival_terminal/gate | |
| Gate Departure (Scheduled/Actual) | scheduled/actual_departure | → TIMESTAMPTZ (UTC) |
| Gate Arrival (Scheduled/Actual) | scheduled/actual_arrival | → TIMESTAMPTZ (UTC) |

**Category:** Always `commercial`

**Passenger linkage:** None (Flighty tracks the user's own flights; user is implicitly the passenger)

**Filters:**
- Skip cancelled flights (`Canceled = "true"`)
- Skip empty routes (missing From or To)

### 3c. Photos Adapter

**Source file:** JSON array of photo records with pre-extracted place data

**Expected JSON format:**
```json
[
  {
    "owner": "Matt",
    "lat": 40.7128,
    "lng": -74.0060,
    "date": "2026-03-15",
    "city": "New York",
    "state": "New York",
    "country": "United States"
  }
]
```

**Delta strategy:**
1. Query watermark: `MAX(data_date_max) FROM import_runs WHERE source = 'photos'`
2. Filter photos where `date < watermark_date` (unless `--full`)
3. Cluster remaining photos into city-day groups (3+ photos = significant visit)
4. Deduplicate: min 30-day gap between visits to same city for same person
5. Dedup against DB before insert

**Dedup key:** `(visit_date, city [case-insensitive], country)`

**Processing pipeline:**
1. Group by `(owner, date, city, country)` → city-day clusters
2. Filter clusters with < 3 photos
3. Sort by date, enforce min-gap-days between same-city visits
4. Check 30-day gap against existing DB visits for that member+city
5. Insert new visits + link family members

**Member linkage:** Match `owner` field against `family_members.name` (case-insensitive)

---

## 4. Apple Photos Extraction

Two supported paths (primary + fallback):

### 4a. Primary: osxphotos CLI

Install: `pip install osxphotos` (one-time setup)

**Extraction command (to be wrapped in a helper script):**
```bash
#!/bin/bash
# scripts/extract-photos.sh
# Extracts geotagged photos since a given date

SINCE_DATE=${1:-$(date -v-90d +%Y-%m-%d)}  # Default: last 90 days
OUTPUT=~/travel-imports/photos_$(date +%Y-%m-%d).json

osxphotos query \
  --from-date "$SINCE_DATE" \
  --has-gps \
  --json \
  --fields "{name},{latitude},{longitude},{date},{place.name},{place.address}" \
  | python3 -c "
import json, sys
photos = json.load(sys.stdin)
result = []
for p in photos:
    if p.get('latitude') and p.get('longitude'):
        # Parse place info from osxphotos output
        place = p.get('place', {}) or {}
        result.append({
            'owner': 'Matt',  # Default owner, TODO: album-based owner mapping
            'lat': p['latitude'],
            'lng': p['longitude'],
            'date': p['date'][:10],
            'city': place.get('city', '') or '',
            'state': place.get('state', '') or None,
            'country': place.get('country', '') or ''
        })
json.dump(result, sys.stdout, indent=2)
" > "$OUTPUT"

echo "Extracted $(python3 -c "import json; print(len(json.load(open('$OUTPUT'))))" ) photos to $OUTPUT"
```

**Owner mapping strategy:**
- Default: all photos attributed to "Matt"
- Future: map shared albums or photo metadata to family members
- Manual override: edit JSON before import if needed

### 4b. Fallback: Manual JSON

If osxphotos isn't available or breaks:
1. User exports photos from Apple Photos (via Shortcuts, share sheet, etc.)
2. Any tool that produces the expected JSON schema works
3. Drop file in `~/travel-imports/photos_YYYY-MM-DD.json`
4. Run `npx tsx scripts/import.ts photos`

---

## 5. Import Engine (Core Loop)

```
For each import run:
  1. Resolve file path (CLI arg → ~/travel-imports/ → error)
  2. Create import_runs record (status = 'running')
  3. Query watermark for this source
  4. Call adapter.parse(filePath, watermarkDate)
  5. Display parse summary, confirm if not --dry-run
  6. For each row:
     a. Call adapter.importRow(row, sql)
     b. Track counts (inserted / skipped_dedup / skipped_error)
  7. Update import_runs record:
     - status = 'completed' (or 'failed')
     - completed_at = now()
     - data_date_min, data_date_max from parsed rows
     - All row counts
  8. Print summary
```

**Transaction strategy:**
- Each row is its own transaction (flight insert + passenger links)
- import_runs record is updated after all rows are processed
- On catastrophic failure, import_runs stays 'running' (can be cleaned up on next run)

**Error handling:**
- Continue-on-error per row (log warning, increment error count)
- Airport lookup failures → skip row with warning
- Family member match failures → insert flight/visit without member link, log warning
- Parse failures → skip row with warning

---

## 6. Output Format

Every import run produces a consistent summary:

```
══════════════════════════════════════════════════════════
  ForeFlight Import — 2026-04-16
══════════════════════════════════════════════════════════
  Source file:    ~/travel-imports/logbook_2026-04-15.csv
  Watermark:      2026-03-13 (last successful import)
  Date range:     2026-03-14 → 2026-04-15

  Parsed:         12 flights (47 skipped before watermark)
  Inserted:       10 flights
  Skipped (dup):  2 flights
  Skipped (err):  0 flights
  Passengers:     8 linked, 2 unmatched

  Warnings:
    - No family member match for: "John Smith"
    - No family member match for: "Jane Doe"

  Import run #42 completed in 3.2s
══════════════════════════════════════════════════════════
```

**Dry-run mode** shows the same output but with "[DRY RUN]" header and no database writes. Useful for previewing what would be imported.

---

## 7. Migration from Supabase to postgres.js

The existing scripts use `@supabase/supabase-js`. The new unified importer will use `postgres` (postgres.js) directly, matching the app's database access pattern.

**What changes:**
- Import `sql` from `@/lib/db` (or create a standalone connection for scripts)
- Replace `.from('table').select()` with tagged template queries
- Replace `.from('table').insert()` with `sql\`INSERT INTO ...\``
- Replace `.eq()` filter chains with SQL WHERE clauses

**Script-specific DB connection:**
Since scripts run outside Next.js, they'll create their own postgres connection:

```typescript
// scripts/lib/db.ts
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, {
  max: 5,
  idle_timeout: 20,
});

export default sql;
```

---

## 8. Workflow (How Matt Actually Uses This)

### After a flight (ForeFlight — GA):
1. Open ForeFlight on iPad → Export logbook as CSV
2. AirDrop or save to `~/travel-imports/`
3. Run: `npx tsx scripts/import.ts foreflight`
4. Review summary, done

### After a flight (Flighty — Commercial):
1. Open Flighty → Export flights as CSV
2. AirDrop or save to `~/travel-imports/`
3. Run: `npx tsx scripts/import.ts flighty`
4. Review summary, done

### After a trip with photos:
1. Run: `bash scripts/extract-photos.sh` (or `bash scripts/extract-photos.sh 2026-01-01` for custom date)
2. Review: `npx tsx scripts/import.ts photos --dry-run`
3. Import: `npx tsx scripts/import.ts photos`
4. Review summary, done

### Periodic catch-up (all sources):
```bash
# Import everything new from all sources
npx tsx scripts/import.ts foreflight
npx tsx scripts/import.ts flighty
npx tsx scripts/import.ts photos
```

---

## 9. Future Extensibility

The adapter pattern makes adding new sources straightforward:

- **FlightAware API** — if Matt gets API access, add a FlightAware adapter that pulls flights directly (no CSV needed)
- **Google Timeline** — export location history, adapt to visits
- **Airline apps** — some airlines offer flight history export
- **Manual entry API** — could expose import engine as an API endpoint for a mobile app

Each new source just implements the `ImportAdapter` interface and registers with the CLI dispatcher.

---

## 10. Implementation Plan (Suggested Order)

1. **Database migration** — Create `import_runs` table
2. **Script DB helper** — `scripts/lib/db.ts` with postgres.js connection
3. **CLI framework** — `scripts/import.ts` with arg parsing and file discovery
4. **ForeFlight adapter** — Port existing script to adapter pattern + postgres.js
5. **Flighty adapter** — Port existing script to adapter pattern + postgres.js
6. **Photos adapter** — Port v2 script to adapter pattern + postgres.js
7. **Photos extraction** — `scripts/extract-photos.sh` wrapper
8. **Testing** — Dry-run each adapter against existing data, verify dedup
9. **Cleanup** — Remove old single-purpose import scripts (or deprecate)

Estimated effort: ~4-6 hours of implementation across 2-3 sessions.
