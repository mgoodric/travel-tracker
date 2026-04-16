#!/usr/bin/env npx tsx
/**
 * Unified delta import CLI for travel-tracker.
 *
 * Usage:
 *   npx tsx scripts/import.ts <source> [options]
 *
 * Sources: foreflight, flighty, photos
 *
 * Options:
 *   --file <path>     Explicit file path (overrides auto-discovery)
 *   --dry-run         Parse and validate without inserting
 *   --full            Ignore watermark, process all rows
 *   --verbose         Show per-row processing details
 *   --min-gap <days>  Photos only: min days between same-city visits (default: 30)
 */

import { readdirSync, existsSync, statSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import sql, { closeDb } from "./lib/db.js";
import type { Source, ImportAdapter, ImportOptions } from "./lib/types.js";

// Lazy-load adapters to avoid circular deps
async function getAdapter(source: Source): Promise<ImportAdapter> {
  switch (source) {
    case "foreflight":
      return (await import("./adapters/foreflight.js")).default;
    case "flighty":
      return (await import("./adapters/flighty.js")).default;
    case "photos":
      return (await import("./adapters/photos.js")).default;
  }
}

// ── Arg parsing ────────────────────────────────────────────────────────

function parseArgs(): { source: Source; options: ImportOptions } {
  const args = process.argv.slice(2);
  const source = args.find((a) => !a.startsWith("--")) as Source | undefined;

  if (!source || !["foreflight", "flighty", "photos"].includes(source)) {
    console.error(`Usage: npx tsx scripts/import.ts <source> [options]

Sources:
  foreflight    Import GA flights from ForeFlight CSV
  flighty       Import commercial flights from Flighty CSV
  photos        Import visits from Apple Photos data

Options:
  --file <path>     Path to import file
  --dry-run         Parse without inserting
  --full            Ignore watermark, process all rows
  --verbose         Show per-row details
  --min-gap <days>  Photos: min days between same-city visits (default: 30)`);
    process.exit(1);
  }

  const fileIdx = args.indexOf("--file");
  const minGapIdx = args.indexOf("--min-gap");

  return {
    source,
    options: {
      dryRun: args.includes("--dry-run"),
      full: args.includes("--full"),
      verbose: args.includes("--verbose"),
      minGapDays: minGapIdx >= 0 ? parseInt(args[minGapIdx + 1]) || 30 : 30,
      file: fileIdx >= 0 ? resolve(args[fileIdx + 1]) : undefined,
    },
  };
}

// ── File discovery ─────────────────────────────────────────────────────

const IMPORT_DIR = join(homedir(), "travel-imports");

const FILE_PATTERNS: Record<Source, { prefix: string; ext: string }> = {
  foreflight: { prefix: "logbook_", ext: ".csv" },
  flighty: { prefix: "FlightyExport-", ext: ".csv" },
  photos: { prefix: "photos_", ext: ".json" },
};

function discoverFile(source: Source): string | null {
  if (!existsSync(IMPORT_DIR)) return null;

  const pattern = FILE_PATTERNS[source];
  const candidates = readdirSync(IMPORT_DIR)
    .filter((f) => f.startsWith(pattern.prefix) && f.endsWith(pattern.ext))
    .map((f) => ({
      name: f,
      path: join(IMPORT_DIR, f),
      mtime: statSync(join(IMPORT_DIR, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  return candidates.length > 0 ? candidates[0].path : null;
}

function resolveFile(source: Source, options: ImportOptions): string {
  // 1. Explicit --file flag
  if (options.file) {
    if (!existsSync(options.file)) {
      console.error(`File not found: ${options.file}`);
      process.exit(1);
    }
    return options.file;
  }

  // 2. Auto-discover from ~/travel-imports/
  const discovered = discoverFile(source);
  if (discovered) return discovered;

  // 3. Error with helpful message
  const pattern = FILE_PATTERNS[source];
  console.error(`No import file found for ${source}.

Expected one of:
  --file <path>                           Explicit file path
  ~/travel-imports/${pattern.prefix}*${pattern.ext}   Auto-discovered

Create ~/travel-imports/ and place your export file there, or use --file.`);
  process.exit(1);
}

// ── Watermark ──────────────────────────────────────────────────────────

async function getWatermark(source: Source): Promise<Date | null> {
  const result = await sql`
    SELECT MAX(data_date_max) AS last_date
    FROM import_runs
    WHERE source = ${source} AND status = 'completed'
  `;
  return result[0]?.last_date ? new Date(result[0].last_date) : null;
}

// ── Import engine ──────────────────────────────────────────────────────

async function createRun(source: Source, filePath: string, watermarkDate: Date | null) {
  const result = await sql`
    INSERT INTO import_runs (source, file_path, watermark_date)
    VALUES (${source}, ${filePath}, ${watermarkDate ? watermarkDate.toISOString().slice(0, 10) : null})
    RETURNING id
  `;
  return result[0].id as number;
}

async function completeRun(
  runId: number,
  status: "completed" | "failed",
  stats: {
    dateMin: Date | null;
    dateMax: Date | null;
    parsed: number;
    inserted: number;
    skippedDedup: number;
    skippedError: number;
    notes: string;
  }
) {
  await sql`
    UPDATE import_runs SET
      status = ${status},
      completed_at = now(),
      data_date_min = ${stats.dateMin ? stats.dateMin.toISOString().slice(0, 10) : null},
      data_date_max = ${stats.dateMax ? stats.dateMax.toISOString().slice(0, 10) : null},
      rows_parsed = ${stats.parsed},
      rows_inserted = ${stats.inserted},
      rows_skipped_dedup = ${stats.skippedDedup},
      rows_skipped_error = ${stats.skippedError},
      notes = ${stats.notes || null}
    WHERE id = ${runId}
  `;
}

function formatDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "none";
}

async function run() {
  const startTime = Date.now();
  const { source, options } = parseArgs();
  const adapter = await getAdapter(source);
  const filePath = resolveFile(source, options);

  const sourceLabel = source.charAt(0).toUpperCase() + source.slice(1);
  const today = new Date().toISOString().slice(0, 10);

  console.log("══════════════════════════════════════════════════════════");
  if (options.dryRun) {
    console.log(`  ${sourceLabel} Import [DRY RUN] — ${today}`);
  } else {
    console.log(`  ${sourceLabel} Import — ${today}`);
  }
  console.log("══════════════════════════════════════════════════════════");
  console.log(`  Source file:    ${filePath}`);

  // Get watermark
  const watermarkDate = options.full ? null : await getWatermark(source);
  console.log(`  Watermark:      ${watermarkDate ? formatDate(watermarkDate) + " (last successful import)" : "none (first import or --full)"}`);

  // Parse
  const parseResult = await adapter.parse(filePath, watermarkDate, options);
  console.log(`  Date range:     ${formatDate(parseResult.dateMin)} → ${formatDate(parseResult.dateMax)}`);
  console.log();
  console.log(`  Parsed:         ${parseResult.rows.length} rows${parseResult.skippedBeforeWatermark > 0 ? ` (${parseResult.skippedBeforeWatermark} skipped before watermark)` : ""}`);

  if (parseResult.rows.length === 0) {
    console.log("\n  Nothing to import.");
    console.log("══════════════════════════════════════════════════════════");
    await closeDb();
    return;
  }

  // Create run record (skip in dry-run)
  let runId: number | null = null;
  if (!options.dryRun) {
    runId = await createRun(source, filePath, watermarkDate);
  }

  // Process rows
  let inserted = 0;
  let skippedDedup = 0;
  let skippedError = 0;
  const warnings: string[] = [...parseResult.warnings];

  for (const row of parseResult.rows) {
    try {
      if (options.dryRun) {
        // In dry-run, just count as "would insert" (no dedup check)
        inserted++;
        continue;
      }

      const outcome = await adapter.importRow(row, sql);
      switch (outcome) {
        case "inserted":
          inserted++;
          if (options.verbose) {
            console.log(`    + ${formatDate(row.date)} inserted`);
          }
          break;
        case "skipped_dedup":
          skippedDedup++;
          if (options.verbose) {
            console.log(`    ~ ${formatDate(row.date)} duplicate`);
          }
          break;
        case "skipped_error":
          skippedError++;
          break;
      }
    } catch (err) {
      skippedError++;
      const msg = err instanceof Error ? err.message : String(err);
      warnings.push(`Row error (${formatDate(row.date)}): ${msg}`);
      if (options.verbose) {
        console.log(`    ! ${formatDate(row.date)} error: ${msg}`);
      }
    }
  }

  // Print summary
  const unit = source === "photos" ? "visits" : "flights";
  console.log(`  Inserted:       ${inserted} ${unit}`);
  console.log(`  Skipped (dup):  ${skippedDedup} ${unit}`);
  console.log(`  Skipped (err):  ${skippedError} ${unit}`);

  if (warnings.length > 0) {
    console.log();
    console.log("  Warnings:");
    for (const w of warnings.slice(0, 20)) {
      console.log(`    - ${w}`);
    }
    if (warnings.length > 20) {
      console.log(`    ... and ${warnings.length - 20} more`);
    }
  }

  // Complete run record
  if (runId !== null) {
    await completeRun(runId, skippedError > parseResult.rows.length / 2 ? "failed" : "completed", {
      dateMin: parseResult.dateMin,
      dateMax: parseResult.dateMax,
      parsed: parseResult.rows.length,
      inserted,
      skippedDedup,
      skippedError,
      notes: warnings.join("\n"),
    });
    console.log();
    console.log(`  Import run #${runId} completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  }

  console.log("══════════════════════════════════════════════════════════");

  await closeDb();
}

run().catch(async (err) => {
  console.error("Fatal error:", err);
  await closeDb();
  process.exit(1);
});
