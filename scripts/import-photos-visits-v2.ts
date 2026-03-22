/**
 * Import visits from Apple Photos location data (pre-extracted with place info).
 * No geocoding needed — uses Apple Photos' built-in address data.
 *
 * Usage: npx tsx scripts/import-photos-visits-v2.ts /tmp/photos_with_places.json [--dry-run] [--min-gap-days=30]
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

interface Photo {
  owner: string;
  lat: number;
  lng: number;
  date: string;
  city: string;
  state: string | null;
  country: string;
}

interface CityVisit {
  owner: string;
  date: string;
  city: string;
  state: string | null;
  country: string;
  lat: number;
  lng: number;
  photoCount: number;
}

function clusterToVisits(photos: Photo[]): CityVisit[] {
  // Group by owner + date + city + country
  const groups = new Map<string, { photos: Photo[]; lat: number; lng: number }>();

  for (const p of photos) {
    const key = `${p.owner}|${p.date}|${p.city.toLowerCase()}|${p.country.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, { photos: [], lat: p.lat, lng: p.lng });
    }
    groups.get(key)!.photos.push(p);
  }

  return Array.from(groups.entries())
    .filter(([, g]) => g.photos.length >= 3) // Minimum 3 photos = significant visit
    .map(([, g]) => ({
      owner: g.photos[0].owner,
      date: g.photos[0].date,
      city: g.photos[0].city,
      state: g.photos[0].state,
      country: g.photos[0].country,
      lat: g.lat,
      lng: g.lng,
      photoCount: g.photos.length,
    }));
}

function deduplicateVisits(visits: CityVisit[], minGapDays: number): CityVisit[] {
  const sorted = [...visits].sort((a, b) => a.date.localeCompare(b.date));
  const groups = new Map<string, CityVisit[]>();

  for (const v of sorted) {
    const key = `${v.owner}|${v.city.toLowerCase()}|${v.country.toLowerCase()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }

  const results: CityVisit[] = [];
  for (const [, cityVisits] of groups) {
    // Track state info
    const state = cityVisits.find((v) => v.state)?.state || null;

    let lastKeptDate = "";
    for (const v of cityVisits) {
      if (!lastKeptDate) {
        results.push({ ...v, state: state || v.state });
        lastKeptDate = v.date;
      } else {
        const gap = (new Date(v.date).getTime() - new Date(lastKeptDate).getTime()) / (1000 * 60 * 60 * 24);
        if (gap >= minGapDays) {
          results.push({ ...v, state: state || v.state });
          lastKeptDate = v.date;
        }
      }
    }
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  const minGapArg = args.find((a) => a.startsWith("--min-gap-days="));
  const minGapDays = minGapArg ? parseInt(minGapArg.split("=")[1]) : 30;

  if (!filePath) {
    console.error("Usage: npx tsx scripts/import-photos-visits-v2.ts <photos.json> [--dry-run] [--min-gap-days=30]");
    process.exit(1);
  }

  const photos: Photo[] = JSON.parse(readFileSync(filePath, "utf-8"));
  console.log(`Loaded ${photos.length} photos`);

  const visits = clusterToVisits(photos);
  console.log(`City-day groups (3+ photos): ${visits.length}`);

  const deduped = deduplicateVisits(visits, minGapDays);
  console.log(`After dedup (${minGapDays}d gap): ${deduped.length} visits`);

  if (dryRun) {
    console.log("\n=== DRY RUN ===\n");
    const byOwner = new Map<string, CityVisit[]>();
    for (const v of deduped) {
      if (!byOwner.has(v.owner)) byOwner.set(v.owner, []);
      byOwner.get(v.owner)!.push(v);
    }
    for (const [owner, ownerVisits] of byOwner) {
      console.log(`\n--- ${owner} (${ownerVisits.length} visits) ---`);
      for (const v of ownerVisits) {
        const loc = [v.city, v.state, v.country].filter(Boolean).join(", ");
        console.log(`  ${v.date}  ${loc}  (${v.photoCount} photos)`);
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

  // Build per-member per-city date list from existing DB visits for 30d gap checking
  // Fetch all existing visits (paginate to avoid 1000 row default limit)
  const existingVisits: { visit_date: string; city: string | null; country: string; members: unknown[] }[] = [];
  let offset = 0;
  while (true) {
    const { data: batch } = await supabase
      .from("visits")
      .select("visit_date, city, country, members:visit_members(family_member:family_members(name))")
      .range(offset, offset + 999);
    if (!batch || batch.length === 0) break;
    existingVisits.push(...batch);
    offset += batch.length;
    if (batch.length < 1000) break;
  }

  const memberCityDates = new Map<string, string[]>();
  for (const v of existingVisits) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const visitMembers = (v.members ?? []) as any[];
    for (const m of visitMembers) {
      const name = m.family_member?.name?.toLowerCase() || "";
      const key = `${name}|${(v.city || "").toLowerCase()}|${v.country.toLowerCase()}`;
      if (!memberCityDates.has(key)) memberCityDates.set(key, []);
      memberCityDates.get(key)!.push(v.visit_date);
    }
    // Also track visits without members for global dedup
    const globalKey = `|${(v.city || "").toLowerCase()}|${v.country.toLowerCase()}`;
    if (!memberCityDates.has(globalKey)) memberCityDates.set(globalKey, []);
    memberCityDates.get(globalKey)!.push(v.visit_date);
  }

  console.log(`Loaded ${existingVisits?.length ?? 0} existing visits for gap checking`);

  let created = 0;
  let linked = 0;
  let skipped = 0;
  let gapSkipped = 0;

  for (const v of deduped) {
    const memberId = memberMap.get(v.owner.toLowerCase());
    if (!memberId) continue;

    // Check 30d gap against existing DB visits for this member+city
    const memberKey = `${v.owner.toLowerCase()}|${v.city.toLowerCase()}|${v.country.toLowerCase()}`;
    const existingDates = memberCityDates.get(memberKey) || [];
    const tooClose = existingDates.some((ed) => {
      const gap = Math.abs(new Date(v.date).getTime() - new Date(ed).getTime()) / (1000 * 60 * 60 * 24);
      return gap < minGapDays;
    });

    if (tooClose) {
      gapSkipped++;
      continue;
    }

    // Check if visit exists (exact date + city + country)
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

      // Track this new visit for gap checking subsequent photo visits
      if (!memberCityDates.has(memberKey)) memberCityDates.set(memberKey, []);
      memberCityDates.get(memberKey)!.push(v.date);
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
  console.log(`Skipped (within ${minGapDays}d of existing): ${gapSkipped}`);
  console.log(`Skipped (existing): ${skipped}`);
}

main().catch(console.error);
