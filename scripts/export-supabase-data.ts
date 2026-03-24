/**
 * Export data from hosted Supabase to SQL INSERT statements.
 * Run: npx tsx scripts/export-supabase-data.ts
 *
 * Uses Supabase REST API directly (no SDK dependency).
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import * as fs from "fs";
import * as path from "path";

// Load .env.local
const envPath = path.resolve(__dirname, "../.env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const env: Record<string, string> = {};
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx > 0) {
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

function escapeSQL(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

function toInsert(table: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return `-- No data in ${table}\n`;
  const cols = Object.keys(rows[0]);
  const lines = rows.map((row) => {
    const vals = cols.map((c) => escapeSQL(row[c])).join(", ");
    return `(${vals})`;
  });
  return `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n${lines.join(",\n")};\n`;
}

async function fetchAll(table: string, orderBy = "created_at"): Promise<Record<string, unknown>[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?order=${orderBy}.asc`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function fetchAllNoOrder(table: string): Promise<Record<string, unknown>[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Failed to fetch ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const output: string[] = [];
  output.push("-- Travel Tracker data export from Supabase");
  output.push(`-- Generated: ${new Date().toISOString()}`);
  output.push("BEGIN;\n");

  // Export in FK dependency order (airports skipped — use import-airports.ts)
  console.error("Exporting family_members...");
  const familyMembers = await fetchAll("family_members");
  output.push(toInsert("family_members", familyMembers));

  console.error("Exporting flights...");
  const flights = await fetchAll("flights");
  output.push(toInsert("flights", flights));

  console.error("Exporting flight_passengers...");
  const fp = await fetchAllNoOrder("flight_passengers");
  output.push(toInsert("flight_passengers", fp));

  console.error("Exporting visits...");
  const visits = await fetchAll("visits");
  output.push(toInsert("visits", visits));

  console.error("Exporting visit_members...");
  const vm = await fetchAllNoOrder("visit_members");
  output.push(toInsert("visit_members", vm));

  output.push("COMMIT;\n");

  const sqlOutput = output.join("\n");
  fs.writeFileSync("data-export.sql", sqlOutput);
  console.error(`Export complete. Written to data-export.sql (${sqlOutput.length} bytes)`);
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
