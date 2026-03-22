/**
 * Import Google Takeout Location History (Semantic Location History) as visits.
 *
 * Usage:
 *   npx tsx scripts/import-google-takeout-visits.ts <path-to-takeout-dir> [--dry-run] [--min-hours=4]
 *
 * The <path-to-takeout-dir> should point to either:
 *   - The "Takeout" root directory
 *   - The "Location History (Timeline)" or "Location History" directory
 *   - The "Semantic Location History" directory
 *
 * Options:
 *   --dry-run       Preview what would be imported without writing to DB
 *   --min-hours=N   Minimum hours at a location to count as a visit (default: 4)
 *   --home=CITY     Home city to exclude (e.g., --home=Seattle) — can be specified multiple times
 *   --members=NAME  Family members to attach (e.g., --members=Matt,Shawna)
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join } from "path";

// --- Types ---

interface PlaceVisitLocation {
  latitudeE7?: number;
  longitudeE7?: number;
  placeId?: string;
  address?: string;
  name?: string;
  locationConfidence?: number;
}

interface PlaceVisit {
  location: PlaceVisitLocation;
  duration: {
    startTimestamp?: string;
    startTimestampMs?: string;
    endTimestamp?: string;
    endTimestampMs?: string;
  };
  placeConfidence?: string;
  visitConfidence?: number;
  placeVisitType?: string;
  placeVisitImportance?: string;
}

interface TimelineObject {
  placeVisit?: PlaceVisit;
  activitySegment?: unknown;
}

interface SemanticFile {
  timelineObjects?: TimelineObject[];
}

interface ParsedVisit {
  date: string;
  city: string | null;
  state: string | null;
  country: string;
  notes: string;
  durationHours: number;
  lat: number;
  lng: number;
}

// --- Address Parsing ---

// Map common country names from Google addresses to our COUNTRIES list values
const COUNTRY_ALIASES: Record<string, string> = {
  "US": "United States",
  "USA": "United States",
  "United States of America": "United States",
  "UK": "United Kingdom",
  "Great Britain": "United Kingdom",
  "England": "United Kingdom",
  "Scotland": "United Kingdom",
  "Wales": "United Kingdom",
  "Northern Ireland": "United Kingdom",
  "Republic of Korea": "South Korea",
  "Korea": "South Korea",
  "Türkiye": "Turkey",
  "Czechia": "Czech Republic",
  "Timor-Leste": "East Timor",
  "Myanmar (Burma)": "Myanmar",
  "Côte d'Ivoire": "Ivory Coast",
  "Cabo Verde": "Cabo Verde",
  "Eswatini": "Eswatini",
};

// US state abbreviations for parsing addresses
const US_STATE_ABBREVS: Record<string, string> = {
  "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas",
  "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware",
  "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho",
  "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas",
  "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
  "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi",
  "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
  "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
  "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
  "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
  "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah",
  "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia",
  "WI": "Wisconsin", "WY": "Wyoming", "DC": "District of Columbia",
};

// Full state name set for matching
const US_STATE_NAMES = new Set(Object.values(US_STATE_ABBREVS));

function parseAddress(address: string): { city: string | null; state: string | null; country: string | null } {
  // Normalize multiline addresses (2018+ format uses \n instead of ,)
  const normalized = address.replace(/\n/g, ", ").replace(/\s+/g, " ");

  // Google addresses are typically: "Street, City, State ZIP, Country"
  // or international: "Street, City, Country"
  const parts = normalized.split(",").map((p) => p.trim()).filter(Boolean);

  if (parts.length < 2) return { city: null, state: null, country: null };

  // Last part is usually the country
  let countryRaw = parts[parts.length - 1];
  let country = COUNTRY_ALIASES[countryRaw] || countryRaw;

  // Check if it's a US address (state + ZIP pattern)
  let state: string | null = null;
  let city: string | null = null;

  if (country === "United States" || country === "USA" || country === "US") {
    country = "United States";
    // Second to last might be "State ZIP" or just "State"
    if (parts.length >= 3) {
      const stateZipPart = parts[parts.length - 2].trim();
      // Match "WA 98101" or "WA" or "Washington"
      const stateZipMatch = stateZipPart.match(/^([A-Z]{2})\s*\d{0,5}/);
      if (stateZipMatch && US_STATE_ABBREVS[stateZipMatch[1]]) {
        state = US_STATE_ABBREVS[stateZipMatch[1]];
      } else if (US_STATE_NAMES.has(stateZipPart)) {
        state = stateZipPart;
      } else if (US_STATE_ABBREVS[stateZipPart]) {
        state = US_STATE_ABBREVS[stateZipPart];
      }
      // City is typically 2 positions before country (before state)
      city = parts.length >= 4 ? parts[parts.length - 3] : null;
    }
  } else {
    // International: city is second to last
    city = parts.length >= 3 ? parts[parts.length - 2] : parts[0];
  }

  // Clean up city - remove postal codes, postcodes, and leading numbers
  if (city) {
    city = city
      .replace(/\b[A-Z]{1,2}\d{1,2}\s*\d[A-Z]{2}\b/g, "") // UK postcodes like "G31 2HA"
      .replace(/\b[A-Z]\d[A-Z]\s*\d[A-Z]\d\b/g, "") // Canadian postcodes like "V6B 1Y6"
      .replace(/\b\d{4,10}\b/g, "") // Long numeric codes
      .replace(/^[\d\s]+/, "") // Leading numbers/spaces
      .trim();
    if (!city) city = null;
  }

  // For international addresses, if city looks like a postal code region, try harder
  if (city && country !== "United States") {
    // "British Columbia V6C 2E8" -> "Vancouver" won't work without geocoding,
    // but at least clean up the postal code portion
    city = city.replace(/\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d$/, "").trim(); // trailing CA postcode
    city = city.replace(/\s+[A-Z]{1,2}\d+\s*\d*[A-Z]*$/, "").trim(); // trailing UK-style postcode
    if (!city || /^[A-Z]{2,3}\s/.test(city)) city = null; // still looks like a code
  }

  return { city, state, country };
}

// --- File Discovery ---

function findSemanticFiles(basePath: string): string[] {
  const candidates = [
    basePath,
    join(basePath, "Location History (Timeline)"),
    join(basePath, "Location History"),
    join(basePath, "Takeout", "Location History (Timeline)"),
    join(basePath, "Takeout", "Location History"),
  ];

  for (const candidate of candidates) {
    const semanticDir = join(candidate, "Semantic Location History");
    if (existsSync(semanticDir)) {
      return findJsonFiles(semanticDir);
    }
  }

  // Maybe the path IS the semantic directory
  if (existsSync(basePath)) {
    const files = findJsonFiles(basePath);
    if (files.length > 0) return files;
  }

  return [];
}

function findJsonFiles(dir: string): string[] {
  const files: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files.push(...findJsonFiles(fullPath));
      } else if (entry.endsWith(".json") && entry !== "Settings.json") {
        files.push(fullPath);
      }
    }
  } catch {
    // skip unreadable dirs
  }
  return files.sort();
}

// --- Visit Extraction ---

function extractVisits(files: string[], minHours: number): ParsedVisit[] {
  const visits: ParsedVisit[] = [];

  for (const file of files) {
    let data: SemanticFile;
    try {
      data = JSON.parse(readFileSync(file, "utf-8"));
    } catch {
      console.warn(`  Skipping unreadable file: ${file}`);
      continue;
    }

    if (!data.timelineObjects) continue;

    for (const obj of data.timelineObjects) {
      if (!obj.placeVisit) continue;

      const pv = obj.placeVisit;
      const loc = pv.location;
      if (!loc.address && !loc.name) continue;

      // Parse timestamps
      let start: Date | null = null;
      let end: Date | null = null;

      if (pv.duration.startTimestamp) {
        start = new Date(pv.duration.startTimestamp);
      } else if (pv.duration.startTimestampMs) {
        start = new Date(parseInt(pv.duration.startTimestampMs));
      }

      if (pv.duration.endTimestamp) {
        end = new Date(pv.duration.endTimestamp);
      } else if (pv.duration.endTimestampMs) {
        end = new Date(parseInt(pv.duration.endTimestampMs));
      }

      if (!start || !end) continue;

      const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
      if (durationHours < minHours) continue;

      // Parse address
      const address = loc.address || "";
      const { city, state, country } = parseAddress(address);

      if (!country) continue;

      const lat = (loc.latitudeE7 ?? 0) / 1e7;
      const lng = (loc.longitudeE7 ?? 0) / 1e7;

      const dateParts = start.toISOString().split("T")[0]; // YYYY-MM-DD

      const noteParts: string[] = [];
      if (loc.name) noteParts.push(loc.name);
      noteParts.push(`${Math.round(durationHours)}h`);

      visits.push({
        date: dateParts,
        city,
        state,
        country,
        notes: noteParts.join(" — "),
        durationHours,
        lat,
        lng,
      });
    }
  }

  return visits;
}

// Deduplicate: same city+country+date = one visit (keep longest)
function deduplicateVisits(visits: ParsedVisit[]): ParsedVisit[] {
  const map = new Map<string, ParsedVisit>();

  for (const v of visits) {
    const key = `${v.date}|${v.city}|${v.state}|${v.country}`;
    const existing = map.get(key);
    if (!existing || v.durationHours > existing.durationHours) {
      map.set(key, v);
    }
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// City-level dedup: keeps visits to the same city if separated by minGapDays.
// For cities visited frequently (home-like), only the first visit is kept.
// Merges entries with/without state (prefers the one with state).
function deduplicateToCities(visits: ParsedVisit[], minGapDays: number): ParsedVisit[] {
  const sorted = [...visits].sort((a, b) => a.date.localeCompare(b.date));

  // Track state info per city for upgrading entries missing state
  const stateInfo = new Map<string, string>();
  for (const v of sorted) {
    if (v.state) {
      const key = `${(v.city || "").toLowerCase().trim()}|${v.country.toLowerCase().trim()}`;
      if (!stateInfo.has(key)) stateInfo.set(key, v.state);
    }
  }

  // Group visits by city+country
  const groups = new Map<string, ParsedVisit[]>();
  for (const v of sorted) {
    const key = `${(v.city || "").toLowerCase().trim()}|${v.country.toLowerCase().trim()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }

  const results: ParsedVisit[] = [];

  for (const [key, cityVisits] of groups) {
    // Apply state info to all entries
    const state = stateInfo.get(key);

    // Keep first visit, then subsequent visits that are minGapDays apart from last kept
    let lastKeptDate = "";
    for (const v of cityVisits) {
      if (!lastKeptDate) {
        results.push({ ...v, state: state || v.state, notes: "" });
        lastKeptDate = v.date;
      } else {
        const daysSince = (new Date(v.date).getTime() - new Date(lastKeptDate).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince >= minGapDays) {
          results.push({ ...v, state: state || v.state, notes: "" });
          lastKeptDate = v.date;
        }
      }
    }
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

// Consolidate consecutive days in the same city into a single trip visit
// Uses the first day as the visit date, and notes the trip duration
function consolidateTrips(visits: ParsedVisit[]): ParsedVisit[] {
  if (visits.length === 0) return [];

  const sorted = [...visits].sort((a, b) => a.date.localeCompare(b.date));
  const trips: ParsedVisit[] = [];
  let tripStart = sorted[0];
  let tripEnd = sorted[0];
  let placeNames = new Set<string>();

  const placeName = (v: ParsedVisit) => v.notes.split(" — ")[0] || "";

  placeNames.add(placeName(tripStart));

  for (let i = 1; i < sorted.length; i++) {
    const v = sorted[i];
    const prevDate = new Date(tripEnd.date);
    const currDate = new Date(v.date);
    const daysBetween = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

    const sameCity = (v.city || "") === (tripStart.city || "") &&
                     (v.state || "") === (tripStart.state || "") &&
                     v.country === tripStart.country;

    if (sameCity && daysBetween <= 2) {
      // Continue the trip (allow 1 gap day for day trips away)
      tripEnd = v;
      placeNames.add(placeName(v));
    } else {
      // Emit the completed trip
      trips.push(buildTrip(tripStart, tripEnd, placeNames));
      tripStart = v;
      tripEnd = v;
      placeNames = new Set();
      placeNames.add(placeName(v));
    }
  }

  // Emit last trip
  trips.push(buildTrip(tripStart, tripEnd, placeNames));
  return trips;
}

function buildTrip(start: ParsedVisit, end: ParsedVisit, placeNames: Set<string>): ParsedVisit {
  const startDate = new Date(start.date);
  const endDate = new Date(end.date);
  const days = Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const names = Array.from(placeNames).filter(Boolean);
  const topName = names[0] || "";
  const notes = days > 1
    ? `${topName} (${days} days, ${start.date} to ${end.date})`
    : `${topName}`;

  return {
    ...start,
    notes,
    durationHours: start.durationHours,
  };
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2);
  const takeoutPath = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const minHoursArg = args.find((a) => a.startsWith("--min-hours="));
  const minHours = minHoursArg ? parseFloat(minHoursArg.split("=")[1]) : 4;
  const minGapArg = args.find((a) => a.startsWith("--min-gap-days="));
  const minGapDays = minGapArg ? parseInt(minGapArg.split("=")[1]) : 30;
  const homeArgs = args.filter((a) => a.startsWith("--home=")).map((a) => a.split("=")[1].toLowerCase());
  const membersArg = args.find((a) => a.startsWith("--members="));
  const memberNames = membersArg ? membersArg.split("=")[1].split(",").map((n) => n.trim().toLowerCase()) : [];

  if (!takeoutPath) {
    console.error("Usage: npx tsx scripts/import-google-takeout-visits.ts <path-to-takeout> [options]");
    console.error("\nOptions:");
    console.error("  --dry-run          Preview without writing to DB");
    console.error("  --min-hours=N      Minimum hours to count as visit (default: 4)");
    console.error("  --min-gap-days=N   Min days between repeat visits to same city (default: 30)");
    console.error("  --home=CITY        Home city to exclude (repeatable)");
    console.error("  --members=A,B      Family members to attach");
    process.exit(1);
  }

  console.log(`Searching for Semantic Location History files in: ${takeoutPath}`);
  const files = findSemanticFiles(takeoutPath);

  if (files.length === 0) {
    console.error("No JSON files found. Make sure the path points to your Takeout directory.");
    console.error("Expected structure: .../Semantic Location History/YYYY/YYYY_MONTH.json");
    process.exit(1);
  }

  console.log(`Found ${files.length} JSON files`);
  console.log(`Minimum visit duration: ${minHours} hours`);
  console.log(`Minimum gap between repeat visits: ${minGapDays} days`);

  // Extract all place visits
  let visits = extractVisits(files, minHours);
  console.log(`Extracted ${visits.length} place visits (>= ${minHours}h)`);

  // Filter visits with no parseable city
  visits = visits.filter((v) => v.city);
  console.log(`With valid city: ${visits.length} visits`);

  // City-level dedup: allow repeat visits separated by minGapDays
  visits = deduplicateToCities(visits, minGapDays);
  console.log(`After city dedup (${minGapDays}d gap): ${visits.length} visits`);

  // Filter out home cities if specified
  if (homeArgs.length > 0) {
    console.log(`Excluding home cities: ${homeArgs.join(", ")}`);
    visits = visits.filter((v) => {
      const cityLower = (v.city || "").toLowerCase();
      return !homeArgs.some((h) => cityLower.includes(h));
    });
    console.log(`After home filter: ${visits.length} cities`);
  }

  if (dryRun) {
    console.log("\n=== DRY RUN — Preview ===\n");
    const byYear = new Map<string, ParsedVisit[]>();
    for (const v of visits) {
      const year = v.date.substring(0, 4);
      if (!byYear.has(year)) byYear.set(year, []);
      byYear.get(year)!.push(v);
    }
    for (const [year, yearVisits] of Array.from(byYear.entries()).sort()) {
      console.log(`\n--- ${year} (${yearVisits.length} visits) ---`);
      for (const v of yearVisits) {
        const loc = [v.city, v.state, v.country].filter(Boolean).join(", ");
        console.log(`  ${v.date}  ${loc}  (${v.notes})`);
      }
    }
    console.log(`\nTotal: ${visits.length} visits would be imported`);
    console.log("Run without --dry-run to import");
    return;
  }

  // --- DB Import ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get user_id from existing data
  const { data: sampleFlight } = await supabase.from("flights").select("user_id").limit(1).single();
  if (!sampleFlight) {
    console.error("No existing flights to get user_id from");
    process.exit(1);
  }
  const userId = sampleFlight.user_id;

  // Resolve member IDs
  let memberIds: string[] = [];
  if (memberNames.length > 0) {
    const { data: members } = await supabase.from("family_members").select("id, name");
    memberIds = (members ?? [])
      .filter((m) => memberNames.includes(m.name.toLowerCase()))
      .map((m) => m.id);
    console.log(`Attaching members: ${memberNames.join(", ")} (${memberIds.length} found)`);
  }

  // Check for existing visits to avoid duplicates
  const { data: existingVisits } = await supabase
    .from("visits")
    .select("visit_date, city, state, country");

  const existingSet = new Set(
    (existingVisits ?? []).map((v) => `${v.visit_date}|${v.city}|${v.state}|${v.country}`)
  );

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const v of visits) {
    const key = `${v.date}|${v.city}|${v.state}|${v.country}`;
    if (existingSet.has(key)) {
      skipped++;
      continue;
    }

    const { data: visit, error } = await supabase
      .from("visits")
      .insert({
        user_id: userId,
        visit_date: v.date,
        country: v.country,
        state: v.state,
        city: v.city,
        notes: v.notes,
      })
      .select("id")
      .single();

    if (error) {
      console.error(`  Error: ${v.date} ${v.city}, ${v.country}: ${error.message}`);
      errors++;
      continue;
    }

    // Add member associations
    if (memberIds.length > 0) {
      await supabase.from("visit_members").insert(
        memberIds.map((mid) => ({ visit_id: visit.id, family_member_id: mid }))
      );
    }

    existingSet.add(key);
    created++;
  }

  console.log("\n=== RESULTS ===");
  console.log(`Created: ${created} visits`);
  console.log(`Skipped (duplicate): ${skipped}`);
  console.log(`Errors: ${errors}`);
}

main().catch(console.error);
