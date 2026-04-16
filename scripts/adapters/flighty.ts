import { readFileSync } from "fs";
import type postgres from "postgres";
import type {
  ImportAdapter,
  ParseResult,
  NormalizedRow,
  RowOutcome,
  ImportOptions,
} from "../lib/types.js";
import sql from "../lib/db.js"; // used in parse() for airport lookups; importRow() uses the passed-in sql param
import { parseCSVLine } from "../lib/csv.js";
import { haversineMiles } from "../lib/haversine.js";
import { getUserId } from "../lib/auth.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapSeatType(value: string): "window" | "middle" | "aisle" | null {
  const map: Record<string, "window" | "middle" | "aisle"> = {
    WINDOW: "window",
    MIDDLE: "middle",
    AISLE: "aisle",
  };
  return map[value.toUpperCase()] ?? null;
}

function mapCabinClass(
  value: string,
): "economy" | "premium_economy" | "business" | "first" | null {
  const map: Record<
    string,
    "economy" | "premium_economy" | "business" | "first"
  > = {
    ECONOMY: "economy",
    PREMIUM_ECONOMY: "premium_economy",
    BUSINESS: "business",
    FIRST: "first",
  };
  return map[value.toUpperCase()] ?? null;
}

function mapFlightReason(value: string): "business" | "leisure" | null {
  const map: Record<string, "business" | "leisure"> = {
    BUSINESS: "business",
    LEISURE: "leisure",
  };
  return map[value.toUpperCase()] ?? null;
}

/**
 * Convert a Flighty datetime string (YYYY-MM-DDTHH:MM) to a full ISO
 * TIMESTAMPTZ string by appending ":00Z". Returns null when empty.
 */
function toTimestamptz(datetime: string): string | null {
  if (!datetime) return null;
  // Flighty format: 2007-12-15T12:25 (no seconds, no timezone)
  // Treat as UTC since we don't have timezone info from the CSV
  return datetime.length === 16 ? datetime + ":00Z" : datetime + "Z";
}

// ---------------------------------------------------------------------------
// Airport cache — populated during parse(), reused in importRow()
// ---------------------------------------------------------------------------

interface AirportRecord {
  id: number;
  latitude: number;
  longitude: number;
}

// Module-level cache — assumes single-run CLI lifecycle
const airportCache = new Map<string, AirportRecord | null>();

async function resolveAirport(
  iata: string,
): Promise<AirportRecord | null> {
  if (airportCache.has(iata)) return airportCache.get(iata)!;

  const rows = await sql`
    SELECT id, latitude, longitude
    FROM airports
    WHERE iata_code = ${iata}
    LIMIT 1
  `;

  if (rows.length === 0) {
    airportCache.set(iata, null);
    return null;
  }

  const record: AirportRecord = {
    id: rows[0].id,
    latitude: Number(rows[0].latitude),
    longitude: Number(rows[0].longitude),
  };
  airportCache.set(iata, record);
  return record;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const adapter: ImportAdapter = {
  source: "flighty",

  async parse(
    filePath: string,
    watermarkDate: Date | null,
    _options: ImportOptions,
  ): Promise<ParseResult> {
    const csvText = readFileSync(filePath, "utf-8");
    const lines = csvText.split("\n");
    const headers = parseCSVLine(lines[0]);

    const rows: NormalizedRow[] = [];
    const warnings: string[] = [];
    let dateMin: Date | null = null;
    let dateMax: Date | null = null;
    let skippedBeforeWatermark = 0;

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;

      const values = parseCSVLine(lines[i]);
      const row = Object.fromEntries(
        headers.map((h, idx) => [h, values[idx] || ""]),
      );

      // Skip cancelled flights
      if (row["Canceled"] === "true") {
        warnings.push(`Row ${i}: skipped cancelled flight`);
        continue;
      }

      // Skip empty routes
      const fromIata = row["From"];
      const toIata = row["To"];
      if (!fromIata || !toIata) {
        warnings.push(`Row ${i}: skipped empty route (From=${fromIata}, To=${toIata})`);
        continue;
      }

      // Parse date for watermark comparison
      const departureDate = row["Date"];
      if (!departureDate) {
        warnings.push(`Row ${i}: skipped missing date`);
        continue;
      }

      const rowDate = new Date(departureDate + "T00:00:00Z");

      // Watermark filter
      if (watermarkDate && rowDate < watermarkDate) {
        skippedBeforeWatermark++;
        continue;
      }

      // Resolve airports
      const depAirport = await resolveAirport(fromIata);
      const arrAirport = await resolveAirport(toIata);

      if (!depAirport) {
        warnings.push(`Row ${i}: departure airport not found for IATA "${fromIata}"`);
        continue;
      }
      if (!arrAirport) {
        warnings.push(`Row ${i}: arrival airport not found for IATA "${toIata}"`);
        continue;
      }

      // Compute distance via Haversine
      const distanceMiles = haversineMiles(
        depAirport.latitude,
        depAirport.longitude,
        arrAirport.latitude,
        arrAirport.longitude,
      );

      // Track date range
      if (!dateMin || rowDate < dateMin) dateMin = rowDate;
      if (!dateMax || rowDate > dateMax) dateMax = rowDate;

      rows.push({
        date: rowDate,
        data: {
          departure_date: departureDate,
          airline: row["Airline"] || null,
          flight_number: row["Flight"] || null,
          aircraft_type: row["Aircraft Type Name"] || null,
          tail_number: row["Tail Number"] || null,
          departure_airport_id: depAirport.id,
          arrival_airport_id: arrAirport.id,
          distance_miles: distanceMiles,
          notes: row["Notes"] || null,
          seat: row["Seat"] || null,
          seat_type: mapSeatType(row["Seat Type"] || ""),
          cabin_class: mapCabinClass(row["Cabin Class"] || ""),
          flight_reason: mapFlightReason(row["Flight Reason"] || ""),
          booking_reference: row["PNR"] || null,
          departure_terminal: row["Dep Terminal"] || null,
          departure_gate: row["Dep Gate"] || null,
          arrival_terminal: row["Arr Terminal"] || null,
          arrival_gate: row["Arr Gate"] || null,
          scheduled_departure: toTimestamptz(row["Gate Departure (Scheduled)"] || ""),
          actual_departure: toTimestamptz(row["Gate Departure (Actual)"] || ""),
          scheduled_arrival: toTimestamptz(row["Gate Arrival (Scheduled)"] || ""),
          actual_arrival: toTimestamptz(row["Gate Arrival (Actual)"] || ""),
        },
      });
    }

    return { rows, dateMin, dateMax, skippedBeforeWatermark, warnings };
  },

  async importRow(
    row: NormalizedRow,
    txSql: postgres.Sql,
  ): Promise<RowOutcome> {
    const d = row.data;
    const userId = getUserId();

    // Dedup check: (departure_date, departure_airport_id, arrival_airport_id, airline, flight_number)
    const existing = await txSql`
      SELECT id FROM flights
      WHERE departure_date = ${d.departure_date}
        AND departure_airport_id = ${d.departure_airport_id}
        AND arrival_airport_id = ${d.arrival_airport_id}
        AND airline IS NOT DISTINCT FROM ${d.airline}
        AND flight_number IS NOT DISTINCT FROM ${d.flight_number}
      LIMIT 1
    `;

    if (existing.length > 0) {
      return "skipped_dedup";
    }

    try {
      await txSql`
        INSERT INTO flights (
          user_id,
          category,
          departure_date,
          airline,
          flight_number,
          aircraft_type,
          tail_number,
          departure_airport_id,
          arrival_airport_id,
          distance_miles,
          notes,
          seat,
          seat_type,
          cabin_class,
          flight_reason,
          booking_reference,
          departure_terminal,
          departure_gate,
          arrival_terminal,
          arrival_gate,
          scheduled_departure,
          actual_departure,
          scheduled_arrival,
          actual_arrival
        ) VALUES (
          ${userId},
          'commercial',
          ${d.departure_date},
          ${d.airline},
          ${d.flight_number},
          ${d.aircraft_type},
          ${d.tail_number},
          ${d.departure_airport_id},
          ${d.arrival_airport_id},
          ${d.distance_miles},
          ${d.notes},
          ${d.seat},
          ${d.seat_type},
          ${d.cabin_class},
          ${d.flight_reason},
          ${d.booking_reference},
          ${d.departure_terminal},
          ${d.departure_gate},
          ${d.arrival_terminal},
          ${d.arrival_gate},
          ${d.scheduled_departure},
          ${d.actual_departure},
          ${d.scheduled_arrival},
          ${d.actual_arrival}
        )
      `;

      return "inserted";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `Failed to insert flight ${d.departure_date} ${d.airline ?? ""}${d.flight_number ?? ""}: ${message}`,
      );
      return "skipped_error";
    }
  },
};

export default adapter;
