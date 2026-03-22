/**
 * Geocode visits that are missing latitude/longitude using Nominatim.
 * Usage: npx tsx scripts/geocode-visits.ts [--dry-run]
 */

import { createClient } from "@supabase/supabase-js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

async function geocode(city: string, state: string | null, country: string): Promise<{ lat: number; lng: number } | null> {
  const q = [city, state, country].filter(Boolean).join(", ");
  const url = `${NOMINATIM_URL}?q=${encodeURIComponent(q)}&format=json&limit=1`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "TravelTracker/1.0 (personal project)" },
    });
    const data = await res.json();
    if (data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    // ignore
  }
  return null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: visits } = await supabase
    .from("visits")
    .select("id, city, state, country, latitude")
    .is("latitude", null)
    .order("visit_date");

  if (!visits || visits.length === 0) {
    console.log("All visits already geocoded");
    return;
  }

  console.log(`${visits.length} visits need geocoding${dryRun ? " (dry run)" : ""}`);

  let geocoded = 0;
  let failed = 0;

  for (const v of visits) {
    const loc = await geocode(v.city || "", v.state, v.country);

    if (loc) {
      const label = [v.city, v.state, v.country].filter(Boolean).join(", ");
      console.log(`  ${label} -> ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`);

      if (!dryRun) {
        await supabase
          .from("visits")
          .update({ latitude: loc.lat, longitude: loc.lng })
          .eq("id", v.id);
      }
      geocoded++;
    } else {
      console.log(`  FAILED: ${v.city}, ${v.state}, ${v.country}`);
      failed++;
    }

    // Nominatim rate limit: max 1 req/sec
    await sleep(1100);
  }

  console.log(`\nGeocoded: ${geocoded}, Failed: ${failed}`);
}

main().catch(console.error);
