import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

interface CsvRow {
  from: string;
  to: string;
  flightNum: string;
  date: string;
  matt: boolean;
  shawna: boolean;
  sullivan: boolean;
  collins: boolean;
  work: boolean;
  reason: string;
  confirmationCode: string;
  cabinClass: string;
}

function parseCsv(filePath: string): CsvRow[] {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());
  // Skip header
  return lines.slice(1).map((line) => {
    // Handle potential commas in fields - this CSV is simple enough
    const parts = line.split(",");
    return {
      from: parts[0]?.trim() || "",
      to: parts[1]?.trim() || "",
      flightNum: parts[2]?.trim() || "",
      date: parts[3]?.trim() || "",
      matt: parts[4]?.trim() === "X",
      shawna: parts[5]?.trim() === "X",
      sullivan: parts[6]?.trim() === "X",
      collins: parts[7]?.trim() === "X",
      work: parts[8]?.trim() === "X",
      reason: parts[9]?.trim() || "",
      confirmationCode: parts[10]?.trim() || "",
      cabinClass: parts[11]?.trim() || "",
    };
  });
}

function parseDate(dateStr: string): string {
  // Format: M/D/YYYY -> YYYY-MM-DD
  const parts = dateStr.split("/");
  if (parts.length !== 3) return "";
  const month = parts[0].padStart(2, "0");
  const day = parts[1].padStart(2, "0");
  const year = parts[2];
  return `${year}-${month}-${day}`;
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const csvPath = process.argv[2] || `${process.env.HOME}/Downloads/Flying.csv`;
  const rows = parseCsv(csvPath);

  console.log(`Parsed ${rows.length} CSV rows`);

  // Get family members
  const { data: members } = await supabase
    .from("family_members")
    .select("id, name");

  if (!members || members.length === 0) {
    console.error("No family members found");
    process.exit(1);
  }

  const memberMap = new Map<string, string>();
  for (const m of members) {
    memberMap.set(m.name.toLowerCase(), m.id);
  }

  console.log("Family members:", Array.from(memberMap.keys()).join(", "));

  const mattId = memberMap.get("matt") || memberMap.get("gmoney");
  const shawnaId = memberMap.get("shawna");
  const sullivanId = memberMap.get("sullivan") || memberMap.get("sully");
  const collinsId = memberMap.get("collins");

  // Try partial matching if exact match fails
  if (!mattId || !shawnaId || !sullivanId || !collinsId) {
    console.log("Trying partial name matching...");
    for (const [name, id] of memberMap) {
      console.log(`  Found: "${name}" -> ${id}`);
    }
  }

  // Build airport IATA -> id lookup (paginate to get all ~40K airports)
  const iataToId = new Map<string, number>();
  let offset = 0;
  const pageSize = 1000;
  while (true) {
    const { data: airports } = await supabase
      .from("airports")
      .select("id, iata_code")
      .not("iata_code", "is", null)
      .neq("iata_code", "")
      .range(offset, offset + pageSize - 1);

    if (!airports || airports.length === 0) break;
    for (const a of airports) {
      if (a.iata_code) iataToId.set(a.iata_code, a.id);
    }
    offset += airports.length;
    if (airports.length < pageSize) break;
  }

  console.log(`Loaded ${iataToId.size} airports with IATA codes`);

  // Get all existing flights to match against
  const { data: existingFlights } = await supabase
    .from("flights")
    .select("id, departure_airport_id, arrival_airport_id, departure_date, notes");

  if (!existingFlights) {
    console.error("Failed to fetch flights");
    process.exit(1);
  }

  // Build lookup: "depId-arrId-date" -> flight
  const flightLookup = new Map<string, typeof existingFlights[0]>();
  for (const f of existingFlights) {
    const key = `${f.departure_airport_id}-${f.arrival_airport_id}-${f.departure_date}`;
    flightLookup.set(key, f);
  }

  console.log(`${existingFlights.length} existing flights in DB`);

  // Get all existing flight_passengers
  const { data: existingPassengers } = await supabase
    .from("flight_passengers")
    .select("flight_id, family_member_id");

  const passengerSet = new Set<string>();
  if (existingPassengers) {
    for (const p of existingPassengers) {
      passengerSet.add(`${p.flight_id}-${p.family_member_id}`);
    }
  }

  let matched = 0;
  let unmatched = 0;
  let passengersAdded = 0;
  let notesUpdated = 0;
  const unmatchedRows: string[] = [];

  for (const row of rows) {
    const depId = iataToId.get(row.from);
    const arrId = iataToId.get(row.to);
    const date = parseDate(row.date);

    if (!depId || !arrId || !date) {
      unmatched++;
      unmatchedRows.push(`No airport: ${row.from}->${row.to} on ${row.date}`);
      continue;
    }

    const key = `${depId}-${arrId}-${date}`;
    const flight = flightLookup.get(key);

    if (!flight) {
      unmatched++;
      unmatchedRows.push(`No flight match: ${row.from}->${row.to} on ${row.date} (${row.flightNum})`);
      continue;
    }

    matched++;

    // Add passengers for Shawna, Sullivan, Collins
    const toAdd: { memberId: string | undefined; name: string; isOnFlight: boolean }[] = [
      { memberId: mattId, name: "Matt", isOnFlight: row.matt },
      { memberId: shawnaId, name: "Shawna", isOnFlight: row.shawna },
      { memberId: sullivanId, name: "Sullivan", isOnFlight: row.sullivan },
      { memberId: collinsId, name: "Collins", isOnFlight: row.collins },
    ];

    for (const { memberId, name, isOnFlight } of toAdd) {
      if (!isOnFlight || !memberId) continue;

      const passengerKey = `${flight.id}-${memberId}`;
      if (passengerSet.has(passengerKey)) continue;

      const { error } = await supabase.from("flight_passengers").insert({
        flight_id: flight.id,
        family_member_id: memberId,
        role: "passenger",
      });

      if (error) {
        console.error(`  Error adding ${name} to flight ${row.from}->${row.to}: ${error.message}`);
      } else {
        passengerSet.add(passengerKey);
        passengersAdded++;
      }
    }

    // Update notes with Reason if not already set
    if (row.reason && (!flight.notes || flight.notes.trim() === "")) {
      const { error } = await supabase
        .from("flights")
        .update({ notes: row.reason })
        .eq("id", flight.id);

      if (error) {
        console.error(`  Error updating notes for ${row.from}->${row.to}: ${error.message}`);
      } else {
        flight.notes = row.reason; // prevent double-update for same flight
        notesUpdated++;
      }
    }
  }

  console.log("\n=== RESULTS ===");
  console.log(`Matched: ${matched} flights`);
  console.log(`Unmatched: ${unmatched} flights`);
  console.log(`Passengers added: ${passengersAdded}`);
  console.log(`Notes updated: ${notesUpdated}`);

  if (unmatchedRows.length > 0) {
    console.log(`\nUnmatched flights (${unmatchedRows.length}):`);
    for (const u of unmatchedRows) {
      console.log(`  ${u}`);
    }
  }
}

main().catch(console.error);
