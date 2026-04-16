---
task: Delta import pipeline from ForeFlight Flighty Photos
slug: 20260416-120000_delta-import-pipeline-spec
effort: extended
phase: complete
progress: 16/16
mode: interactive
started: 2026-04-16T12:00:00-07:00
updated: 2026-04-16T12:00:30-07:00
---

## Context

Matt wants a consistent, repeatable import pipeline for his travel tracker that handles 3 data sources:
1. **ForeFlight** — GA flight logbook (CSV export, pilot flights)
2. **Flighty** — Commercial flight tracker (CSV export, airline flights)
3. **Apple Photos** — Geotagged photos → visit records (JSON pre-extraction)

Currently: 3 separate one-off scripts with hardcoded paths, Supabase client (app uses postgres.js), no watermark tracking, full-file dedup on every run. Each import requires manual file placement and script invocation.

Goal: Unified import system that tracks last-import timestamps per source, imports only deltas, and minimizes manual steps. This is a **spec/design** deliverable, not implementation.

### Risks
- ForeFlight and Flighty exports are always full dumps (no API for incremental export) — delta must be computed by filtering CSV rows by date > watermark
- Apple Photos extraction depends on external tooling (osxphotos or Swift/AppleScript) — needs investigation
- Existing scripts use Supabase client but app uses postgres.js — migration needed
- Dedup logic differs per source — must preserve source-specific dedup keys
- Backdated entries (logging old flights retroactively) could be missed by pure watermark — watermark must be optimization only, dedup remains the correctness guarantee
- Apple Photos library access may require permissions/entitlements on newer macOS versions
- Passenger/member name matching is fuzzy and can fail silently

## Criteria

- [x] ISC-1: Spec defines import_runs table schema with per-source tracking (Section 1)
- [x] ISC-2: Spec defines unified CLI entry point with source selection (Section 2)
- [x] ISC-3: Spec documents ForeFlight CSV delta strategy using departure_date filtering (Section 3a)
- [x] ISC-4: Spec documents Flighty CSV delta strategy using date filtering (Section 3b)
- [x] ISC-5: Spec documents Apple Photos delta strategy using photo date filtering (Section 3c)
- [x] ISC-6: Spec defines dedup keys per source (preserved from existing scripts) (Sections 3a/3b/3c)
- [x] ISC-7: Spec addresses migration from Supabase client to postgres.js (Section 7)
- [x] ISC-8: Spec documents Apple Photos extraction method — osxphotos primary + manual fallback (Section 4)
- [x] ISC-9: Spec defines dry-run mode for all sources (Section 2 CLI options + Section 6)
- [x] ISC-10: Spec defines import summary output format (inserted/skipped/errors) (Section 6)
- [x] ISC-11: Spec addresses passenger/member linkage for each source (Sections 3a/3b/3c)
- [x] ISC-12: Spec defines error handling strategy (continue-on-error per row) (Section 5)
- [x] ISC-13: Spec defines watermark update timing (only after successful import) (Section 5 step 7 + Section 1 status field)
- [x] ISC-14: Spec addresses how user provides export files (hybrid file discovery) (Section 2)
- [x] ISC-15: Spec includes workflow for each source (Section 8)
- [x] ISC-16: Spec defines future extensibility for additional sources (Section 9)

## Decisions

- **import_runs over import_watermarks**: Single table for audit + state. Watermark derived via MAX(data_date_max). Council vote: 2-1 for separate table, but combined approach gets both benefits.
- **osxphotos + manual fallback**: Primary extraction via osxphotos CLI with manual JSON drop as fallback. Council vote: 2-1 osxphotos.
- **Hybrid file discovery**: Fixed ~/travel-imports/ directory + CLI --file override. Council vote: 2-1 hybrid.
- **Watermark = optimization, dedup = correctness**: All sources do full dumps; backdating makes watermark-only unsafe. First Principles analysis confirmed this.

## Verification

- Spec written to docs/delta-import-pipeline-spec.md (10 sections, ~350 lines)
- All 16 ISC criteria addressed with specific section references
- Field mappings preserved exactly from existing import-foreflight.ts and import-flighty.ts
- Dedup keys verified against existing scripts
- Architecture decisions backed by 3-agent council debate
