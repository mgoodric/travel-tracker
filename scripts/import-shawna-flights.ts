import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const EARTH_RADIUS_MILES = 3958.8;
function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function parseDate(dateStr: string): string {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[0].padStart(2, "0")}-${parts[1].padStart(2, "0")}`;
}

function parseCabinClass(cls: string): string | null {
  const normalized = cls.toLowerCase().trim();
  if (normalized === "economy") return "economy";
  if (normalized === "premium economy") return "premium_economy";
  if (normalized === "business") return "business";
  if (normalized === "first") return "first";
  return "economy";
}

function parseAirline(flightNum: string): { airline: string; number: string } {
  const parts = flightNum.trim().split(/\s+/);
  return { airline: parts[0] || "", number: parts.slice(1).join(" ") || "" };
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get Shawna's member ID
  const { data: members } = await supabase.from("family_members").select("id, name");
  const shawna = members?.find((m) => m.name.toLowerCase() === "shawna");
  if (!shawna) {
    console.error("Shawna not found in family_members");
    process.exit(1);
  }
  console.log(`Shawna ID: ${shawna.id}`);

  // Get user_id from an existing flight
  const { data: sampleFlight } = await supabase
    .from("flights")
    .select("user_id")
    .limit(1)
    .single();
  if (!sampleFlight) {
    console.error("No existing flights to get user_id");
    process.exit(1);
  }
  const userId = sampleFlight.user_id;

  // Build airport IATA -> full record lookup
  const iataToAirport = new Map<string, { id: number; latitude: number; longitude: number }>();
  let offset = 0;
  while (true) {
    const { data: airports } = await supabase
      .from("airports")
      .select("id, iata_code, latitude, longitude")
      .not("iata_code", "is", null)
      .neq("iata_code", "")
      .range(offset, offset + 999);
    if (!airports || airports.length === 0) break;
    for (const a of airports) {
      if (a.iata_code) iataToAirport.set(a.iata_code, { id: a.id, latitude: a.latitude, longitude: a.longitude });
    }
    offset += airports.length;
    if (airports.length < 1000) break;
  }
  console.log(`Loaded ${iataToAirport.size} airports`);

  // Parse CSV and find Shawna-only flights
  const content = readFileSync(process.argv[2] || `${process.env.HOME}/Downloads/Flying.csv`, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  // Check for existing flights to avoid duplicates
  const { data: existingFlights } = await supabase
    .from("flights")
    .select("departure_airport_id, arrival_airport_id, departure_date");
  const existingSet = new Set<string>();
  if (existingFlights) {
    for (const f of existingFlights) {
      existingSet.add(`${f.departure_airport_id}-${f.arrival_airport_id}-${f.departure_date}`);
    }
  }

  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length < 12) continue;

    const matt = parts[4]?.trim() === "X";
    const shawnaOn = parts[5]?.trim() === "X";
    const sullivan = parts[6]?.trim() === "X";
    const collins = parts[7]?.trim() === "X";

    // Only Shawna-only flights
    if (!shawnaOn || matt || sullivan || collins) continue;

    const from = parts[0]?.trim();
    const to = parts[1]?.trim();
    const flightNum = parts[2]?.trim() || "";
    const dateStr = parts[3]?.trim() || "";
    const work = parts[8]?.trim() === "X";
    const reason = parts[9]?.trim() || "";
    const confirmationCode = parts[10]?.trim() || "";
    const cabinClass = parts[11]?.trim() || "";

    const depAirport = iataToAirport.get(from);
    const arrAirport = iataToAirport.get(to);

    if (!depAirport || !arrAirport) {
      console.error(`  Airport not found: ${from} or ${to}`);
      errors++;
      continue;
    }

    const date = parseDate(dateStr);
    if (!date) {
      console.error(`  Bad date: ${dateStr}`);
      errors++;
      continue;
    }

    // Check for duplicate
    const key = `${depAirport.id}-${arrAirport.id}-${date}`;
    if (existingSet.has(key)) {
      console.log(`  Already exists: ${from}->${to} on ${dateStr}, skipping`);
      skipped++;
      continue;
    }

    const distance = haversineMiles(
      depAirport.latitude, depAirport.longitude,
      arrAirport.latitude, arrAirport.longitude
    );

    const { airline, number } = parseAirline(flightNum);
    const flightReason = work ? "business" : "leisure";

    const { data: flight, error } = await supabase
      .from("flights")
      .insert({
        user_id: userId,
        category: "commercial",
        airline,
        flight_number: number,
        departure_airport_id: depAirport.id,
        arrival_airport_id: arrAirport.id,
        departure_date: date,
        distance_miles: distance,
        notes: reason || null,
        cabin_class: parseCabinClass(cabinClass),
        flight_reason: flightReason,
        booking_reference: confirmationCode || null,
      })
      .select("id")
      .single();

    if (error) {
      console.error(`  Error inserting ${from}->${to} on ${dateStr}: ${error.message}`);
      errors++;
      continue;
    }

    // Add Shawna as passenger
    await supabase.from("flight_passengers").insert({
      flight_id: flight.id,
      family_member_id: shawna.id,
      role: "passenger",
    });

    existingSet.add(key);
    created++;
    console.log(`  Created: ${from}->${to} on ${dateStr} (${flightNum}) - ${distance}mi`);
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Created: ${created} flights`);
  console.log(`Skipped (duplicate): ${skipped}`);
  console.log(`Errors: ${errors}`);
}

main().catch(console.error);
