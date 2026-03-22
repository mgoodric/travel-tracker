import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const CSV_PATH = "/Users/gmoney/Downloads/logbook_2026-03-13_15_48_58.csv";
const NM_TO_SM = 1.15078;
const EARTH_RADIUS_MI = 3958.8;
const BATCH_SIZE = 50;

interface AircraftInfo {
  typeCode: string;
  make: string;
  model: string;
  equipType: string;
}

interface AirportCache {
  id: number;
  latitude: number;
  longitude: number;
}

interface FlightRow {
  date: string;
  aircraftId: string;
  from: string;
  to: string;
  timeOut: string;
  timeIn: string;
  distance: number;
  pilotComments: string;
  persons: string[];
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

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_MI * c);
}

function stripTripleQuotes(s: string): string {
  if (!s) return "";
  let result = s;
  // ForeFlight wraps comments in triple double-quotes: """text"""
  if (result.startsWith('"""') && result.endsWith('"""')) {
    result = result.slice(3, -3);
  } else if (result.startsWith('"') && result.endsWith('"')) {
    result = result.slice(1, -1);
  }
  return result.trim();
}

function buildTimestamp(date: string, time: string): string | null {
  if (!date || !time) return null;
  // Date is YYYY-MM-DD, time is HH:MM (UTC)
  return `${date}T${time}:00Z`;
}

async function main() {
  const supabaseUrl =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
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

  // ── Read and split CSV ────────────────────────────────────────────
  console.log("Reading ForeFlight CSV...");
  const csvText = readFileSync(CSV_PATH, "utf-8");
  const lines = csvText.split("\n");

  // ── Parse Aircraft Table ──────────────────────────────────────────
  // Line 1: ForeFlight header (skip)
  // Line 2: blank (skip)
  // Line 3: "Aircraft Table" marker (skip)
  // Line 4: Aircraft headers
  // Lines 5+: Aircraft data until blank line
  const aircraftMap = new Map<string, AircraftInfo>();
  const aircraftHeaders = parseCSVLine(lines[3]); // 0-indexed line 4
  const aircraftIdIdx = aircraftHeaders.indexOf("AircraftID");
  const typeCodeIdx = aircraftHeaders.indexOf("TypeCode");
  const makeIdx = aircraftHeaders.indexOf("Make");
  const modelIdx = aircraftHeaders.indexOf("Model");
  const equipTypeIdx = aircraftHeaders.findIndex((h) =>
    h.toLowerCase().startsWith("equiptype")
  );

  let flightsStartLine = -1;
  for (let i = 4; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      // Blank line — look for "Flights Table" marker next
      continue;
    }
    if (trimmed.startsWith("Flights Table")) {
      flightsStartLine = i + 1; // Next line is flights header
      break;
    }
    const values = parseCSVLine(lines[i]);
    const id = values[aircraftIdIdx];
    if (!id) continue;
    const equipType = values[equipTypeIdx] || "";
    if (equipType.toLowerCase() === "aatd") {
      console.log(`  Skipping simulator: ${id}`);
      continue;
    }
    aircraftMap.set(id, {
      typeCode: values[typeCodeIdx] || "",
      make: values[makeIdx] || "",
      model: values[modelIdx] || "",
      equipType,
    });
  }
  console.log(`Parsed ${aircraftMap.size} aircraft (excluding simulators)`);

  if (flightsStartLine < 0) {
    console.error("Could not find Flights Table in CSV");
    process.exit(1);
  }

  // ── Parse Flights Table ───────────────────────────────────────────
  const flightHeaders = parseCSVLine(lines[flightsStartLine]);
  const fIdx = (name: string) => flightHeaders.indexOf(name);
  const dateIdx = fIdx("Date");
  const fAircraftIdx = fIdx("AircraftID");
  const fromIdx = fIdx("From");
  const toIdx = fIdx("To");
  const timeOutIdx = fIdx("TimeOut");
  const timeInIdx = fIdx("TimeIn");
  const distanceIdx = fIdx("Distance");
  const commentsIdx = fIdx("PilotComments");
  const personIndices = [
    fIdx("Person1"),
    fIdx("Person2"),
    fIdx("Person3"),
    fIdx("Person4"),
    fIdx("Person5"),
    fIdx("Person6"),
  ].filter((i) => i >= 0);

  const flights: FlightRow[] = [];
  for (let i = flightsStartLine + 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const aircraftId = values[fAircraftIdx] || "";
    const from = values[fromIdx] || "";

    // Skip simulator flights
    if (!aircraftMap.has(aircraftId)) {
      if (aircraftId) {
        console.log(`  Skipping flight on simulator/unknown aircraft: ${aircraftId}`);
      }
      continue;
    }

    // Skip flights with empty From
    if (!from) {
      console.log(`  Skipping flight with empty departure: ${values[dateIdx]} ${aircraftId}`);
      continue;
    }

    // Skip coordinate-based From fields (e.g., "40.13°N/105.06°W")
    if (from.includes("°")) {
      console.log(`  Skipping coordinate-based flight: ${from}`);
      continue;
    }

    flights.push({
      date: values[dateIdx] || "",
      aircraftId,
      from,
      to: values[toIdx] || from, // Default to From if To is empty
      timeOut: values[timeOutIdx] || "",
      timeIn: values[timeInIdx] || "",
      distance: parseFloat(values[distanceIdx]) || 0,
      pilotComments: values[commentsIdx] || "",
      persons: personIndices
        .map((idx) => values[idx] || "")
        .filter((p) => p.length > 0),
    });
  }
  console.log(`Parsed ${flights.length} valid flights`);

  // ── Cache airport lookups ─────────────────────────────────────────
  const airportCache = new Map<string, AirportCache | null>();
  const uniqueAirports = new Set<string>();
  for (const f of flights) {
    uniqueAirports.add(f.from);
    uniqueAirports.add(f.to);
  }

  // Manual overrides for airports whose ForeFlight code differs from OurAirports ident
  const IDENT_OVERRIDES: Record<string, string> = {
    KFLY: "K00V",  // Meadow Lake Airport, Colorado Springs CO
    KMAN: "KS67",  // Nampa Municipal Airport, Nampa ID
  };

  console.log(`Looking up ${uniqueAirports.size} unique airport codes...`);
  for (const ident of uniqueAirports) {
    // Check manual overrides first
    const resolvedIdent = IDENT_OVERRIDES[ident] || ident;
    if (resolvedIdent !== ident) {
      console.log(`  Override ${ident} → ${resolvedIdent}`);
    }

    // Try exact match
    let { data } = await supabase
      .from("airports")
      .select("id, latitude, longitude")
      .eq("ident", resolvedIdent)
      .limit(1)
      .single();

    // Fallback: FAA LID → ICAO by adding K prefix (e.g., X35 → KX35)
    if (!data && !resolvedIdent.startsWith("K") && resolvedIdent.length <= 4) {
      const icaoIdent = "K" + resolvedIdent;
      const fallback = await supabase
        .from("airports")
        .select("id, latitude, longitude")
        .eq("ident", icaoIdent)
        .limit(1)
        .single();
      if (fallback.data) {
        console.log(`  Matched ${ident} → ${icaoIdent}`);
        data = fallback.data;
      }
    }

    if (!data) {
      console.warn(`  Airport not found: ${ident}`);
      airportCache.set(ident, null);
    } else {
      airportCache.set(ident, {
        id: data.id,
        latitude: data.latitude,
        longitude: data.longitude,
      });
    }
  }

  // ── Cache family members ──────────────────────────────────────────
  const { data: familyMembers } = await supabase
    .from("family_members")
    .select("id, name")
    .eq("user_id", userId);

  const familyMap = new Map<string, string>(); // lowercase name → id
  for (const fm of familyMembers || []) {
    familyMap.set(fm.name.toLowerCase(), fm.id);
  }
  console.log(`Loaded ${familyMap.size} family members`);

  // ── Process flights in batches ────────────────────────────────────
  let insertedCount = 0;
  let skippedCount = 0;
  let passengerCount = 0;

  for (let batchStart = 0; batchStart < flights.length; batchStart += BATCH_SIZE) {
    const batch = flights.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(flights.length / BATCH_SIZE);

    for (const flight of batch) {
      const depAirport = airportCache.get(flight.from);
      const arrAirport = airportCache.get(flight.to);

      if (!depAirport) {
        console.warn(`  Skipping flight: departure airport ${flight.from} not found`);
        skippedCount++;
        continue;
      }
      if (!arrAirport) {
        console.warn(`  Skipping flight: arrival airport ${flight.to} not found`);
        skippedCount++;
        continue;
      }

      const aircraft = aircraftMap.get(flight.aircraftId)!;
      const aircraftType = [aircraft.make, aircraft.model]
        .filter(Boolean)
        .join(" ");

      // ── Distance calculation ────────────────────────────────────
      let distanceMiles: number;
      if (flight.distance > 0) {
        distanceMiles = Math.round(flight.distance * NM_TO_SM);
      } else if (depAirport.id !== arrAirport.id) {
        distanceMiles = haversineMiles(
          depAirport.latitude,
          depAirport.longitude,
          arrAirport.latitude,
          arrAirport.longitude
        );
      } else {
        // Local flight (same airport), distance stays 0
        distanceMiles = 0;
      }

      // ── Timestamps ──────────────────────────────────────────────
      const actualDeparture = buildTimestamp(flight.date, flight.timeOut);
      const actualArrival = buildTimestamp(flight.date, flight.timeIn);

      // ── Notes ───────────────────────────────────────────────────
      const notes = stripTripleQuotes(flight.pilotComments) || null;

      // ── Dedup check ─────────────────────────────────────────────
      let dedupQuery = supabase
        .from("flights")
        .select("id")
        .eq("departure_date", flight.date)
        .eq("departure_airport_id", depAirport.id)
        .eq("arrival_airport_id", arrAirport.id)
        .eq("tail_number", flight.aircraftId);

      const { data: existing } = await dedupQuery.limit(1);
      if (existing && existing.length > 0) {
        skippedCount++;
        continue;
      }

      // ── Insert flight ───────────────────────────────────────────
      const { data: inserted, error: insertError } = await supabase
        .from("flights")
        .insert({
          user_id: userId,
          category: "general_aviation",
          aircraft_type: aircraftType,
          tail_number: flight.aircraftId,
          departure_airport_id: depAirport.id,
          arrival_airport_id: arrAirport.id,
          departure_date: flight.date,
          distance_miles: distanceMiles,
          notes,
          actual_departure: actualDeparture,
          actual_arrival: actualArrival,
        })
        .select("id")
        .single();

      if (insertError) {
        console.error(
          `  Error inserting flight ${flight.date} ${flight.from}->${flight.to}: ${insertError.message}`
        );
        skippedCount++;
        continue;
      }

      insertedCount++;

      // ── Process passengers ──────────────────────────────────────
      if (inserted && flight.persons.length > 0) {
        const passengers: { flight_id: string; family_member_id: string; role: string }[] = [];

        for (const personStr of flight.persons) {
          // Format: "Name;Role;Email;Phone"
          const parts = personStr.split(";");
          const name = parts[0]?.trim();
          if (!name) continue;

          // Match by ILIKE — check our cached family members
          const nameLower = name.toLowerCase();
          let familyMemberId: string | undefined;

          for (const [fmName, fmId] of familyMap.entries()) {
            if (fmName.includes(nameLower) || nameLower.includes(fmName)) {
              familyMemberId = fmId;
              break;
            }
          }

          if (!familyMemberId) {
            // Try partial match: last name or first name
            const nameParts = nameLower.split(" ");
            for (const [fmName, fmId] of familyMap.entries()) {
              for (const part of nameParts) {
                if (part.length > 2 && fmName.includes(part)) {
                  familyMemberId = fmId;
                  break;
                }
              }
              if (familyMemberId) break;
            }
          }

          if (!familyMemberId) {
            console.warn(`  No family member match for: ${name}`);
            continue;
          }

          const role = (parts[1]?.trim() || "passenger").toLowerCase();
          const mappedRole =
            role === "pilot"
              ? "pilot"
              : role === "copilot"
                ? "copilot"
                : "passenger";

          passengers.push({
            flight_id: inserted.id,
            family_member_id: familyMemberId,
            role: mappedRole,
          });
        }

        if (passengers.length > 0) {
          const { error: paxError } = await supabase
            .from("flight_passengers")
            .insert(passengers);

          if (paxError) {
            console.error(
              `  Error inserting passengers for flight ${flight.date} ${flight.from}->${flight.to}: ${paxError.message}`
            );
          } else {
            passengerCount += passengers.length;
          }
        }
      }
    }

    console.log(`  Batch ${batchNum}/${totalBatches} complete`);
  }

  console.log("\n══════════════════════════════════════════");
  console.log(`Import complete!`);
  console.log(`  Flights inserted: ${insertedCount}`);
  console.log(`  Flights skipped (dedup/errors): ${skippedCount}`);
  console.log(`  Passengers linked: ${passengerCount}`);
  console.log("══════════════════════════════════════════");
}

main().catch(console.error);
