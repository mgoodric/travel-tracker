/**
 * Import visits from Apple Photos location data.
 * Reads pre-filtered photos JSON, clusters by location+date, reverse geocodes, imports.
 *
 * Usage: npx tsx scripts/import-photos-visits.ts /tmp/photos_filtered.json [--dry-run] [--min-gap-days=30]
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

interface Photo {
  owner: string;
  lat: number;
  lng: number;
  date: string;
  place: string;
}

interface Cluster {
  owner: string;
  lat: number;
  lng: number;
  date: string;
  photoCount: number;
}

interface GeocodedVisit {
  owner: string;
  date: string;
  city: string;
  state: string | null;
  country: string;
  lat: number;
  lng: number;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";

// Haversine distance in km
function distKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Cluster photos by date + spatial proximity (25km)
function clusterPhotos(photos: Photo[]): Cluster[] {
  // Group by owner + date first
  const byOwnerDate = new Map<string, Photo[]>();
  for (const p of photos) {
    const key = `${p.owner}|${p.date}`;
    if (!byOwnerDate.has(key)) byOwnerDate.set(key, []);
    byOwnerDate.get(key)!.push(p);
  }

  const clusters: Cluster[] = [];

  for (const [, dayPhotos] of byOwnerDate) {
    // Simple greedy clustering: for each photo, add to nearest existing cluster or create new
    const dayClusters: { lat: number; lng: number; count: number }[] = [];

    for (const p of dayPhotos) {
      let merged = false;
      for (const c of dayClusters) {
        if (distKm(p.lat, p.lng, c.lat, c.lng) < 25) {
          // Update centroid
          c.lat = (c.lat * c.count + p.lat) / (c.count + 1);
          c.lng = (c.lng * c.count + p.lng) / (c.count + 1);
          c.count++;
          merged = true;
          break;
        }
      }
      if (!merged) {
        dayClusters.push({ lat: p.lat, lng: p.lng, count: 1 });
      }
    }

    for (const c of dayClusters) {
      clusters.push({
        owner: dayPhotos[0].owner,
        lat: c.lat,
        lng: c.lng,
        date: dayPhotos[0].date,
        photoCount: c.count,
      });
    }
  }

  return clusters;
}

// Deduplicate to one visit per city per owner within minGapDays
function deduplicateClusters(visits: GeocodedVisit[], minGapDays: number): GeocodedVisit[] {
  const sorted = [...visits].sort((a, b) => a.date.localeCompare(b.date));
  const groups = new Map<string, GeocodedVisit[]>();

  for (const v of sorted) {
    const key = `${v.owner}|${v.city.toLowerCase()}|${(v.state || "").toLowerCase()}|${v.country.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }

  const results: GeocodedVisit[] = [];
  for (const [, cityVisits] of groups) {
    let lastKeptDate = "";
    for (const v of cityVisits) {
      if (!lastKeptDate) {
        results.push(v);
        lastKeptDate = v.date;
      } else {
        const gap = (new Date(v.date).getTime() - new Date(lastKeptDate).getTime()) / (1000 * 60 * 60 * 24);
        if (gap >= minGapDays) {
          results.push(v);
          lastKeptDate = v.date;
        }
      }
    }
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

async function reverseGeocode(lat: number, lng: number): Promise<{ city: string; state: string | null; country: string } | null> {
  const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lng}&format=json&zoom=10`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "TravelTracker/1.0 (personal project)" },
    });
    const data = await res.json();
    const addr = data.address;
    if (!addr) return null;

    const city = addr.city || addr.town || addr.village || addr.county || null;
    const state = addr.state || null;
    const country = addr.country || null;

    if (!city || !country) return null;
    return { city, state, country };
  } catch {
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const minGapArg = args.find((a) => a.startsWith("--min-gap-days="));
  const minGapDays = minGapArg ? parseInt(minGapArg.split("=")[1]) : 30;

  if (!filePath) {
    console.error("Usage: npx tsx scripts/import-photos-visits.ts <photos.json> [--dry-run] [--min-gap-days=30]");
    process.exit(1);
  }

  const photos: Photo[] = JSON.parse(readFileSync(filePath, "utf-8"));
  console.log(`Loaded ${photos.length} photos`);

  // Cluster
  const clusters = clusterPhotos(photos);
  console.log(`Clustered into ${clusters.length} location-day groups`);

  // Filter out clusters with very few photos (likely drive-by, not a visit)
  const significantClusters = clusters.filter((c) => c.photoCount >= 3);
  console.log(`Significant clusters (3+ photos): ${significantClusters.length}`);

  // Deduplicate clusters by location (within 25km on same day already handled)
  // Now reverse geocode unique locations
  const locationCache = new Map<string, { city: string; state: string | null; country: string } | null>();

  function locationKey(lat: number, lng: number): string {
    return `${lat.toFixed(2)},${lng.toFixed(2)}`;
  }

  console.log("Reverse geocoding unique locations...");
  const uniqueLocKeys = new Set(significantClusters.map((c) => locationKey(c.lat, c.lng)));
  console.log(`${uniqueLocKeys.size} unique locations to geocode`);

  let geocoded = 0;
  for (const key of uniqueLocKeys) {
    if (locationCache.has(key)) continue;
    const [latStr, lngStr] = key.split(",");
    const result = await reverseGeocode(parseFloat(latStr), parseFloat(lngStr));
    locationCache.set(key, result);
    geocoded++;
    if (geocoded % 50 === 0) console.log(`  Geocoded ${geocoded}/${uniqueLocKeys.size}...`);
    await sleep(1100); // Nominatim rate limit
  }
  console.log(`Geocoded ${geocoded} locations`);

  // Build visits from clusters
  const allVisits: GeocodedVisit[] = [];
  for (const c of significantClusters) {
    const key = locationKey(c.lat, c.lng);
    const loc = locationCache.get(key);
    if (!loc) continue;

    allVisits.push({
      owner: c.owner,
      date: c.date,
      city: loc.city,
      state: loc.state,
      country: loc.country,
      lat: c.lat,
      lng: c.lng,
    });
  }

  console.log(`Total geocoded visits: ${allVisits.length}`);

  // Deduplicate
  const deduped = deduplicateClusters(allVisits, minGapDays);
  console.log(`After dedup (${minGapDays}d gap): ${deduped.length} visits`);

  if (dryRun) {
    console.log("\n=== DRY RUN ===\n");
    const byOwner = new Map<string, GeocodedVisit[]>();
    for (const v of deduped) {
      if (!byOwner.has(v.owner)) byOwner.set(v.owner, []);
      byOwner.get(v.owner)!.push(v);
    }
    for (const [owner, ownerVisits] of byOwner) {
      console.log(`\n--- ${owner} (${ownerVisits.length} visits) ---`);
      for (const v of ownerVisits) {
        const loc = [v.city, v.state, v.country].filter(Boolean).join(", ");
        console.log(`  ${v.date}  ${loc}`);
      }
    }
    console.log(`\nTotal: ${deduped.length} visits would be imported`);
    return;
  }

  // --- DB Import ---
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { data: sample } = await supabase.from("flights").select("user_id").limit(1).single();
  if (!sample) { console.error("No flights"); process.exit(1); }
  const userId = sample.user_id;

  const { data: members } = await supabase.from("family_members").select("id, name");
  const memberMap = new Map((members ?? []).map((m) => [m.name.toLowerCase(), m.id]));

  let created = 0;
  let linked = 0;
  let skipped = 0;

  for (const v of deduped) {
    const memberId = memberMap.get(v.owner.toLowerCase());
    if (!memberId) continue;

    // Check if visit exists
    const { data: existing } = await supabase
      .from("visits")
      .select("id")
      .eq("visit_date", v.date)
      .ilike("city", v.city)
      .eq("country", v.country)
      .limit(1);

    let visitId: string;
    if (existing && existing.length > 0) {
      visitId = existing[0].id;
      skipped++;
    } else {
      const { data: newVisit, error } = await supabase
        .from("visits")
        .insert({
          user_id: userId,
          visit_date: v.date,
          city: v.city,
          state: v.state,
          country: v.country,
          latitude: v.lat,
          longitude: v.lng,
        })
        .select("id")
        .single();

      if (error) { console.error(`Error: ${v.city}: ${error.message}`); continue; }
      visitId = newVisit.id;
      created++;
    }

    // Link member
    const { data: existingVM } = await supabase
      .from("visit_members")
      .select("visit_id")
      .eq("visit_id", visitId)
      .eq("family_member_id", memberId)
      .limit(1);

    if (!existingVM || existingVM.length === 0) {
      await supabase.from("visit_members").insert({
        visit_id: visitId,
        family_member_id: memberId,
      });
      linked++;
    }
  }

  console.log("\n=== RESULTS ===");
  console.log(`Created: ${created} visits`);
  console.log(`Member links added: ${linked}`);
  console.log(`Skipped (existing): ${skipped}`);
}

main().catch(console.error);
