import { readFileSync } from "fs";
import type {
  ImportAdapter,
  ParseResult,
  NormalizedRow,
  RowOutcome,
  ImportOptions,
} from "../lib/types.js";
import type postgres from "postgres";
import sql from "../lib/db.js"; // used in parse() for airport lookups; importRow() uses the passed-in sql param
import { parseCSVLine } from "../lib/csv.js";
import { haversineMiles } from "../lib/haversine.js";
import { getUserId } from "../lib/auth.js";
import { getFamilyMembers } from "../lib/family.js";

// ── Constants ───────────────────────────────────────────────────────────────

const NM_TO_SM = 1.15078;

/** ForeFlight codes that map to a different OurAirports ident */
const IDENT_OVERRIDES: Record<string, string> = {
  KFLY: "K00V", // Meadow Lake Airport, Colorado Springs CO
  KMAN: "KS67", // Nampa Municipal Airport, Nampa ID
};

// ── Utility Functions ───────────────────────────────────────────────────────

function stripTripleQuotes(s: string): string {
  if (!s) return "";
  let result = s;
  if (result.startsWith('"""') && result.endsWith('"""')) {
    result = result.slice(3, -3);
  } else if (result.startsWith('"') && result.endsWith('"')) {
    result = result.slice(1, -1);
  }
  return result.trim();
}

function buildTimestamp(date: string, time: string): string | null {
  if (!date || !time) return null;
  return `${date}T${time}:00Z`;
}

// ── Internal Types ──────────────────────────────────────────────────────────

interface AircraftInfo {
  typeCode: string;
  make: string;
  model: string;
  equipType: string;
}

interface AirportCacheEntry {
  id: number;
  latitude: number;
  longitude: number;
}

// ── Airport Resolution ──────────────────────────────────────────────────────

async function resolveAirport(
  ident: string,
  cache: Map<string, AirportCacheEntry | null>,
  warnings: string[]
): Promise<void> {
  if (cache.has(ident)) return;

  const resolvedIdent = IDENT_OVERRIDES[ident] || ident;
  if (resolvedIdent !== ident) {
    warnings.push(`Airport override: ${ident} -> ${resolvedIdent}`);
  }

  // Try exact match on ident column
  const exact = await sql`
    SELECT id, latitude, longitude
    FROM airports
    WHERE ident = ${resolvedIdent}
    LIMIT 1
  `;

  if (exact.length > 0) {
    cache.set(ident, {
      id: exact[0].id,
      latitude: exact[0].latitude,
      longitude: exact[0].longitude,
    });
    return;
  }

  // Fallback: add K-prefix for FAA LID -> ICAO conversion
  if (!resolvedIdent.startsWith("K") && resolvedIdent.length <= 4) {
    const icaoIdent = "K" + resolvedIdent;
    const fallback = await sql`
      SELECT id, latitude, longitude
      FROM airports
      WHERE ident = ${icaoIdent}
      LIMIT 1
    `;

    if (fallback.length > 0) {
      warnings.push(`Airport K-prefix match: ${ident} -> ${icaoIdent}`);
      cache.set(ident, {
        id: fallback[0].id,
        latitude: fallback[0].latitude,
        longitude: fallback[0].longitude,
      });
      return;
    }
  }

  warnings.push(`Airport not found: ${ident}`);
  cache.set(ident, null);
}

// Family member cache is shared via scripts/lib/family.ts

/**
 * Match a person string (from ForeFlight "Name;Role;Email;Phone" format)
 * against known family members using fuzzy name matching.
 * Returns { familyMemberId, role } or null if no match.
 */
function matchPerson(
  personStr: string,
  familyMap: Map<string, string>
): { familyMemberId: string; role: string } | null {
  const parts = personStr.split(";");
  const name = parts[0]?.trim();
  if (!name) return null;

  const nameLower = name.toLowerCase();
  let familyMemberId: string | undefined;

  // Pass 1: full name containment (either direction)
  for (const [fmName, fmId] of familyMap.entries()) {
    if (fmName.includes(nameLower) || nameLower.includes(fmName)) {
      familyMemberId = fmId;
      break;
    }
  }

  // Pass 2: partial match on individual name parts
  if (!familyMemberId) {
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

  if (!familyMemberId) return null;

  const role = (parts[1]?.trim() || "passenger").toLowerCase();
  const mappedRole =
    role === "pilot" ? "pilot" : role === "copilot" ? "copilot" : "passenger";

  return { familyMemberId, role: mappedRole };
}

// ── Adapter ─────────────────────────────────────────────────────────────────

const adapter: ImportAdapter = {
  source: "foreflight",

  async parse(
    filePath: string,
    watermarkDate: Date | null,
    options: ImportOptions
  ): Promise<ParseResult> {
    const warnings: string[] = [];
    const csvText = readFileSync(filePath, "utf-8");
    const lines = csvText.split("\n");

    // ── Parse Aircraft Table ────────────────────────────────────────
    // Line 1: ForeFlight header (skip)
    // Line 2: blank (skip)
    // Line 3: "Aircraft Table" marker (skip)
    // Line 4: Aircraft headers (0-indexed: line index 3)
    // Lines 5+: Aircraft data until blank line / "Flights Table" marker
    const aircraftMap = new Map<string, AircraftInfo>();
    const aircraftHeaders = parseCSVLine(lines[3]);
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
      if (!trimmed) continue;
      if (trimmed.startsWith("Flights Table")) {
        flightsStartLine = i + 1;
        break;
      }
      const values = parseCSVLine(lines[i]);
      const id = values[aircraftIdIdx];
      if (!id) continue;
      const equipType = values[equipTypeIdx] || "";
      if (equipType.toLowerCase() === "aatd") {
        warnings.push(`Skipping simulator aircraft: ${id}`);
        continue;
      }
      aircraftMap.set(id, {
        typeCode: values[typeCodeIdx] || "",
        make: values[makeIdx] || "",
        model: values[modelIdx] || "",
        equipType,
      });
    }

    if (flightsStartLine < 0) {
      throw new Error("Could not find Flights Table in ForeFlight CSV");
    }

    // ── Parse Flights Table ─────────────────────────────────────────
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

    // Collect unique airport codes for bulk resolution
    const uniqueAirports = new Set<string>();

    // First pass: collect raw flight data and airport codes
    interface RawFlight {
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

    const rawFlights: RawFlight[] = [];
    let skippedBeforeWatermark = 0;

    for (let i = flightsStartLine + 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const values = parseCSVLine(lines[i]);
      const aircraftId = values[fAircraftIdx] || "";
      const from = values[fromIdx] || "";
      const dateStr = values[dateIdx] || "";

      // Skip simulator/unknown aircraft
      if (!aircraftMap.has(aircraftId)) {
        if (aircraftId && options.verbose) {
          warnings.push(
            `Skipping flight on unknown/simulator aircraft: ${aircraftId}`
          );
        }
        continue;
      }

      // Skip empty departure
      if (!from) {
        if (options.verbose) {
          warnings.push(
            `Skipping flight with empty departure: ${dateStr} ${aircraftId}`
          );
        }
        continue;
      }

      // Skip coordinate-based departures
      if (from.includes("\u00B0")) {
        if (options.verbose) {
          warnings.push(`Skipping coordinate-based flight: ${from}`);
        }
        continue;
      }

      // Watermark filter
      if (watermarkDate && dateStr) {
        const rowDate = new Date(dateStr + "T00:00:00Z");
        if (rowDate < watermarkDate) {
          skippedBeforeWatermark++;
          continue;
        }
      }

      const to = values[toIdx] || from;
      uniqueAirports.add(from);
      uniqueAirports.add(to);

      rawFlights.push({
        date: dateStr,
        aircraftId,
        from,
        to,
        timeOut: values[timeOutIdx] || "",
        timeIn: values[timeInIdx] || "",
        distance: parseFloat(values[distanceIdx]) || 0,
        pilotComments: values[commentsIdx] || "",
        persons: personIndices
          .map((idx) => values[idx] || "")
          .filter((p) => p.length > 0),
      });
    }

    // ── Resolve airports ────────────────────────────────────────────
    const airportCache = new Map<string, AirportCacheEntry | null>();
    for (const ident of uniqueAirports) {
      await resolveAirport(ident, airportCache, warnings);
    }

    // ── Build normalized rows ───────────────────────────────────────
    const rows: NormalizedRow[] = [];
    let dateMin: Date | null = null;
    let dateMax: Date | null = null;

    for (const flight of rawFlights) {
      const depAirport = airportCache.get(flight.from);
      const arrAirport = airportCache.get(flight.to);

      if (!depAirport) {
        warnings.push(
          `Skipping flight: departure airport ${flight.from} not found`
        );
        continue;
      }
      if (!arrAirport) {
        warnings.push(
          `Skipping flight: arrival airport ${flight.to} not found`
        );
        continue;
      }

      const aircraft = aircraftMap.get(flight.aircraftId)!;
      const aircraftType = [aircraft.make, aircraft.model]
        .filter(Boolean)
        .join(" ");

      // Distance: CSV NM -> SM, or Haversine, or 0 for local
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
        distanceMiles = 0;
      }

      const notes = stripTripleQuotes(flight.pilotComments) || null;
      const actualDeparture = buildTimestamp(flight.date, flight.timeOut);
      const actualArrival = buildTimestamp(flight.date, flight.timeIn);

      const rowDate = new Date(flight.date + "T00:00:00Z");
      if (!dateMin || rowDate < dateMin) dateMin = rowDate;
      if (!dateMax || rowDate > dateMax) dateMax = rowDate;

      rows.push({
        date: rowDate,
        data: {
          departure_date: flight.date,
          tail_number: flight.aircraftId,
          aircraft_type: aircraftType,
          departure_airport_id: depAirport.id,
          arrival_airport_id: arrAirport.id,
          distance_miles: distanceMiles,
          notes,
          actual_departure: actualDeparture,
          actual_arrival: actualArrival,
          persons: flight.persons,
          dep_lat: depAirport.latitude,
          dep_lon: depAirport.longitude,
          arr_lat: arrAirport.latitude,
          arr_lon: arrAirport.longitude,
        },
      });
    }

    return { rows, dateMin, dateMax, skippedBeforeWatermark, warnings };
  },

  async importRow(
    row: NormalizedRow,
    txSql: postgres.Sql
  ): Promise<RowOutcome> {
    const userId = getUserId();
    const d = row.data;

    // ── Dedup check ───────────────────────────────────────────────
    const existing = await txSql`
      SELECT id FROM flights
      WHERE departure_date = ${d.departure_date}
        AND departure_airport_id = ${d.departure_airport_id}
        AND arrival_airport_id = ${d.arrival_airport_id}
        AND tail_number = ${d.tail_number}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return "skipped_dedup";
    }

    // ── Insert flight ─────────────────────────────────────────────
    let flightId: string;
    try {
      const inserted = await txSql`
        INSERT INTO flights (
          user_id, category, aircraft_type, tail_number,
          departure_airport_id, arrival_airport_id, departure_date,
          distance_miles, notes, actual_departure, actual_arrival
        ) VALUES (
          ${userId}, 'general_aviation', ${d.aircraft_type}, ${d.tail_number},
          ${d.departure_airport_id}, ${d.arrival_airport_id}, ${d.departure_date},
          ${d.distance_miles}, ${d.notes}, ${d.actual_departure}, ${d.actual_arrival}
        )
        RETURNING id
      `;
      flightId = inserted[0].id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `  Error inserting flight ${d.departure_date} ${d.tail_number}: ${msg}`
      );
      return "skipped_error";
    }

    // ── Link passengers ───────────────────────────────────────────
    if (d.persons.length > 0) {
      const familyMap = await getFamilyMembers(txSql);

      const passengers: { flight_id: string; family_member_id: string; role: string }[] = [];

      for (const personStr of d.persons) {
        const match = matchPerson(personStr, familyMap);
        if (!match) {
          const name = personStr.split(";")[0]?.trim() || personStr;
          console.warn(`  No family member match for: ${name}`);
          continue;
        }
        passengers.push({
          flight_id: flightId,
          family_member_id: match.familyMemberId,
          role: match.role,
        });
      }

      if (passengers.length > 0) {
        try {
          await txSql`
            INSERT INTO flight_passengers ${txSql(passengers)}
          `;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `  Error inserting passengers for flight ${d.departure_date} ${d.tail_number}: ${msg}`
          );
          // Flight was still inserted, so we return inserted not error
        }
      }
    }

    return "inserted";
  },
};

export default adapter;
