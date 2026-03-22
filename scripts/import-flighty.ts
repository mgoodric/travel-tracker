import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const CSV_PATH = "/Users/gmoney/Downloads/FlightyExport-2026-03-13.csv";
const BATCH_SIZE = 50;

// Flighty ID columns to skip
const FLIGHTY_ID_COLUMNS = new Set([
  "Flight Flighty ID",
  "Airline Flighty ID",
  "Departure Airport Flighty ID",
  "Arrival Airport Flighty ID",
  "Diverted To Airport Flighty ID",
  "Aircraft Type Flighty ID",
]);

interface AirportRecord {
  id: number;
  latitude: number;
  longitude: number;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function haversineDistanceMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function mapSeatType(
  value: string
): "window" | "middle" | "aisle" | null {
  const map: Record<string, "window" | "middle" | "aisle"> = {
    WINDOW: "window",
    MIDDLE: "middle",
    AISLE: "aisle",
  };
  return map[value.toUpperCase()] ?? null;
}

function mapCabinClass(
  value: string
): "economy" | "premium_economy" | "business" | "first" | null {
  const map: Record<string, "economy" | "premium_economy" | "business" | "first"> = {
    ECONOMY: "economy",
    PREMIUM_ECONOMY: "premium_economy",
    BUSINESS: "business",
    FIRST: "first",
  };
  return map[value.toUpperCase()] ?? null;
}

function mapFlightReason(
  value: string
): "business" | "leisure" | null {
  const map: Record<string, "business" | "leisure"> = {
    BUSINESS: "business",
    LEISURE: "leisure",
  };
  return map[value.toUpperCase()] ?? null;
}

/**
 * Combine a date string (YYYY-MM-DD) with a datetime string (YYYY-MM-DDTHH:MM)
 * into a full ISO TIMESTAMPTZ string. Returns null if the datetime is empty.
 */
function toTimestamptz(datetime: string): string | null {
  if (!datetime) return null;
  // Flighty format: 2007-12-15T12:25 (no seconds, no timezone)
  // Treat as UTC since we don't have timezone info from the CSV
  return datetime.length === 16 ? datetime + ":00Z" : datetime + "Z";
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = process.env.IMPORT_USER_ID;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    process.exit(1);
  }

  if (!userId) {
    console.error("Missing IMPORT_USER_ID env var");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Read and parse CSV
  console.log(`Reading CSV from ${CSV_PATH}...`);
  const csvText = readFileSync(CSV_PATH, "utf-8");
  const lines = csvText.split("\n");
  const headers = parseCSVLine(lines[0]);

  console.log(`Found ${lines.length - 1} data rows`);

  // Airport IATA lookup cache: iata_code -> { id, latitude, longitude }
  const airportCache = new Map<string, AirportRecord | null>();

  async function lookupAirport(iata: string): Promise<AirportRecord | null> {
    if (airportCache.has(iata)) return airportCache.get(iata)!;

    const { data, error } = await supabase
      .from("airports")
      .select("id, latitude, longitude")
      .eq("iata_code", iata)
      .limit(1)
      .single();

    if (error || !data) {
      console.warn(`  Airport not found for IATA: ${iata}`);
      airportCache.set(iata, null);
      return null;
    }

    const record: AirportRecord = {
      id: data.id,
      latitude: data.latitude,
      longitude: data.longitude,
    };
    airportCache.set(iata, record);
    return record;
  }

  // Parse all rows
  const flights: Record<string, any>[] = [];
  let skippedCancelled = 0;
  let skippedMissingAirport = 0;
  let skippedEmptyRoute = 0;

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = parseCSVLine(lines[i]);
    const row = Object.fromEntries(headers.map((h, idx) => [h, values[idx] || ""]));

    // Skip cancelled
    if (row["Canceled"] === "true") {
      skippedCancelled++;
      continue;
    }

    // Skip empty routes
    const fromIata = row["From"];
    const toIata = row["To"];
    if (!fromIata || !toIata) {
      skippedEmptyRoute++;
      continue;
    }

    // Lookup airports
    const depAirport = await lookupAirport(fromIata);
    const arrAirport = await lookupAirport(toIata);
    if (!depAirport || !arrAirport) {
      skippedMissingAirport++;
      continue;
    }

    // Compute distance
    const distanceMiles = haversineDistanceMiles(
      depAirport.latitude,
      depAirport.longitude,
      arrAirport.latitude,
      arrAirport.longitude
    );

    const flight = {
      user_id: userId,
      category: "commercial",
      airline: row["Airline"] || null,
      flight_number: row["Flight"] || null,
      aircraft_type: row["Aircraft Type Name"] || null,
      tail_number: row["Tail Number"] || null,
      departure_airport_id: depAirport.id,
      arrival_airport_id: arrAirport.id,
      departure_date: row["Date"],
      distance_miles: distanceMiles,
      notes: row["Notes"] || null,
      seat: row["Seat"] || null,
      seat_type: mapSeatType(row["Seat Type"]),
      cabin_class: mapCabinClass(row["Cabin Class"]),
      flight_reason: mapFlightReason(row["Flight Reason"]),
      booking_reference: row["PNR"] || null,
      departure_terminal: row["Dep Terminal"] || null,
      departure_gate: row["Dep Gate"] || null,
      arrival_terminal: row["Arr Terminal"] || null,
      arrival_gate: row["Arr Gate"] || null,
      scheduled_departure: toTimestamptz(row["Gate Departure (Scheduled)"]),
      actual_departure: toTimestamptz(row["Gate Departure (Actual)"]),
      scheduled_arrival: toTimestamptz(row["Gate Arrival (Scheduled)"]),
      actual_arrival: toTimestamptz(row["Gate Arrival (Actual)"]),
    };

    flights.push(flight);
  }

  console.log(`\nParsed ${flights.length} valid flights`);
  console.log(`  Skipped cancelled: ${skippedCancelled}`);
  console.log(`  Skipped empty route: ${skippedEmptyRoute}`);
  console.log(`  Skipped missing airport: ${skippedMissingAirport}`);

  // Dedup against existing flights
  console.log("\nChecking for duplicates...");
  const dedupedFlights: Record<string, any>[] = [];

  for (const flight of flights) {
    const { data: existing } = await supabase
      .from("flights")
      .select("id")
      .eq("departure_date", flight.departure_date)
      .eq("departure_airport_id", flight.departure_airport_id)
      .eq("arrival_airport_id", flight.arrival_airport_id)
      .eq("airline", flight.airline)
      .eq("flight_number", flight.flight_number)
      .limit(1);

    if (existing && existing.length > 0) {
      continue;
    }
    dedupedFlights.push(flight);
  }

  const dupeCount = flights.length - dedupedFlights.length;
  console.log(`  Found ${dupeCount} duplicates, ${dedupedFlights.length} new flights to insert`);

  if (dedupedFlights.length === 0) {
    console.log("\nNothing to insert. Done!");
    return;
  }

  // Insert in batches
  console.log(`\nInserting ${dedupedFlights.length} flights in batches of ${BATCH_SIZE}...`);
  let inserted = 0;
  const totalBatches = Math.ceil(dedupedFlights.length / BATCH_SIZE);

  for (let i = 0; i < dedupedFlights.length; i += BATCH_SIZE) {
    const batch = dedupedFlights.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    const { error } = await supabase.from("flights").insert(batch);

    if (error) {
      console.error(`  Error inserting batch ${batchNum}/${totalBatches}:`, error.message);
    } else {
      inserted += batch.length;
      console.log(`  Batch ${batchNum}/${totalBatches} — inserted ${batch.length} flights (${inserted}/${dedupedFlights.length} total)`);
    }
  }

  console.log(`\nImport complete! Inserted ${inserted} flights.`);
}

main().catch(console.error);
