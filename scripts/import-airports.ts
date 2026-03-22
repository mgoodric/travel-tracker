import { createClient } from "@supabase/supabase-js";

const AIRPORTS_CSV_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";

interface AirportRow {
  ident: string;
  iata_code: string | null;
  name: string;
  latitude: number;
  longitude: number;
  elevation_ft: number | null;
  type: string;
  municipality: string | null;
  iso_country: string;
  iso_region: string;
}

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("Fetching airports CSV...");
  const response = await fetch(AIRPORTS_CSV_URL);
  const csvText = await response.text();

  const lines = csvText.split("\n");
  const headers = parseCSVLine(lines[0]);

  const airports: AirportRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const values = parseCSVLine(lines[i]);
    const row = Object.fromEntries(headers.map((h, idx) => [h, values[idx] || ""]));

    // Skip closed airports
    if (row.type === "closed") continue;

    airports.push({
      ident: row.ident,
      iata_code: row.iata_code || null,
      name: row.name,
      latitude: parseFloat(row.latitude_deg),
      longitude: parseFloat(row.longitude_deg),
      elevation_ft: row.elevation_ft ? parseInt(row.elevation_ft) : null,
      type: row.type,
      municipality: row.municipality || null,
      iso_country: row.iso_country,
      iso_region: row.iso_region,
    });
  }

  console.log(`Parsed ${airports.length} airports (excluding closed)`);

  // Bulk insert in batches of 1000
  const BATCH_SIZE = 1000;
  for (let i = 0; i < airports.length; i += BATCH_SIZE) {
    const batch = airports.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("airports").upsert(batch, { onConflict: "ident" });
    if (error) {
      console.error(`Error inserting batch ${i / BATCH_SIZE + 1}:`, error.message);
    } else {
      console.log(`Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(airports.length / BATCH_SIZE)}`);
    }
  }

  console.log("Import complete!");
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

main().catch(console.error);
