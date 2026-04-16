/**
 * Photos adapter — imports visits from Apple Photos location data.
 *
 * Input: JSON array of { owner, lat, lng, date, city, state, country }
 * Pipeline: watermark filter -> clustering (3+ photos/day/city) -> gap dedup -> DB dedup
 */

import { readFileSync } from "fs";
import type {
  ImportAdapter,
  ParseResult,
  NormalizedRow,
  RowOutcome,
  ImportOptions,
} from "../lib/types.js";
import type postgres from "postgres";
import { getUserId } from "../lib/auth.js";
import { getFamilyMembers } from "../lib/family.js";

// ── Types ─────────────────────────────────────────────────────────────

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

// ── Caches (loaded once per importRow lifecycle) ──────────────────────

let existingVisitCache: Map<string, string[]> | null = null;

// ── Clustering ────────────────────────────────────────────────────────

function clusterToVisits(photos: Photo[]): CityVisit[] {
  const groups = new Map<string, { photos: Photo[]; lat: number; lng: number }>();

  for (const p of photos) {
    const key = `${p.owner}|${p.date}|${p.city.toLowerCase()}|${p.country.toLowerCase()}`;
    if (!groups.has(key)) {
      groups.set(key, { photos: [], lat: p.lat, lng: p.lng });
    }
    groups.get(key)!.photos.push(p);
  }

  return Array.from(groups.entries())
    .filter(([, g]) => g.photos.length >= 3)
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

// ── Within-import deduplication ───────────────────────────────────────

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
    const state = cityVisits.find((v) => v.state)?.state || null;

    let lastKeptDate = "";
    for (const v of cityVisits) {
      if (!lastKeptDate) {
        results.push({ ...v, state: state || v.state });
        lastKeptDate = v.date;
      } else {
        const gap =
          (new Date(v.date).getTime() - new Date(lastKeptDate).getTime()) /
          (1000 * 60 * 60 * 24);
        if (gap >= minGapDays) {
          results.push({ ...v, state: state || v.state });
          lastKeptDate = v.date;
        }
      }
    }
  }

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Cache loaders ─────────────────────────────────────────────────────

async function loadExistingVisits(sql: postgres.Sql): Promise<Map<string, string[]>> {
  if (existingVisitCache) return existingVisitCache;

  const userId = getUserId();

  // Paginated fetch of all visits with their member relationships
  const cache = new Map<string, string[]>();
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const batch = await sql`
      SELECT
        v.visit_date,
        v.city,
        v.country,
        COALESCE(
          json_agg(json_build_object('name', fm.name)) FILTER (WHERE fm.id IS NOT NULL),
          '[]'
        ) AS members
      FROM visits v
      LEFT JOIN visit_members vm ON vm.visit_id = v.id
      LEFT JOIN family_members fm ON fm.id = vm.family_member_id
      WHERE v.user_id = ${userId}
      GROUP BY v.id, v.visit_date, v.city, v.country
      ORDER BY v.visit_date
      LIMIT ${pageSize} OFFSET ${offset}
    `;

    if (batch.length === 0) break;

    for (const v of batch) {
      const members = (v.members as { name: string }[]) || [];
      for (const m of members) {
        const name = (m.name || "").toLowerCase();
        const key = `${name}|${(v.city || "").toLowerCase()}|${v.country.toLowerCase()}`;
        if (!cache.has(key)) cache.set(key, []);
        cache.get(key)!.push(v.visit_date);
      }
      // Global key (no member) for date+city dedup
      const globalKey = `|${(v.city || "").toLowerCase()}|${v.country.toLowerCase()}`;
      if (!cache.has(globalKey)) cache.set(globalKey, []);
      cache.get(globalKey)!.push(v.visit_date);
    }

    offset += batch.length;
    if (batch.length < pageSize) break;
  }

  existingVisitCache = cache;
  return cache;
}

// ── Adapter ───────────────────────────────────────────────────────────

const adapter: ImportAdapter = {
  source: "photos",

  async parse(
    filePath: string,
    watermarkDate: Date | null,
    options: ImportOptions
  ): Promise<ParseResult> {
    const raw: Photo[] = JSON.parse(readFileSync(filePath, "utf-8"));
    const warnings: string[] = [];
    let skippedBeforeWatermark = 0;

    // Watermark filter
    const filtered: Photo[] = [];
    for (const p of raw) {
      if (watermarkDate && new Date(p.date) < watermarkDate) {
        skippedBeforeWatermark++;
        continue;
      }
      filtered.push(p);
    }

    if (options.verbose) {
      warnings.push(`Loaded ${raw.length} photos, ${filtered.length} after watermark filter`);
    }

    // Cluster into city-day visits (min 3 photos)
    const visits = clusterToVisits(filtered);

    if (options.verbose) {
      warnings.push(`Clustered into ${visits.length} city-day groups (3+ photos each)`);
    }

    // Within-import gap dedup
    const minGapDays = options.minGapDays ?? 30;
    const deduped = deduplicateVisits(visits, minGapDays);

    if (options.verbose) {
      warnings.push(
        `After ${minGapDays}-day gap dedup: ${deduped.length} visits (removed ${visits.length - deduped.length})`
      );
    }

    // Build normalized rows
    const minGap = options.minGapDays ?? 30;
    const rows: NormalizedRow[] = deduped.map((v) => ({
      data: {
        visit_date: v.date,
        city: v.city,
        state: v.state,
        country: v.country,
        lat: v.lat,
        lng: v.lng,
        owner: v.owner,
        photo_count: v.photoCount,
        min_gap_days: minGap,
      },
      date: new Date(v.date),
    }));

    // Compute date range
    let dateMin: Date | null = null;
    let dateMax: Date | null = null;
    for (const r of rows) {
      if (!dateMin || r.date < dateMin) dateMin = r.date;
      if (!dateMax || r.date > dateMax) dateMax = r.date;
    }

    return { rows, dateMin, dateMax, skippedBeforeWatermark, warnings };
  },

  async importRow(row: NormalizedRow, sql: postgres.Sql): Promise<RowOutcome> {
    const userId = getUserId();

    const { visit_date, city, state, country, lat, lng, owner, min_gap_days } = row.data;
    const minGapDays = min_gap_days ?? 30;

    // Load caches on first call
    const memberMap = await getFamilyMembers(sql);
    const visitCache = await loadExistingVisits(sql);

    // Resolve family member
    const memberId = memberMap.get(owner.toLowerCase());
    if (!memberId) {
      console.warn(`  No family member match for owner: "${owner}"`);
      return "skipped_error";
    }

    // Check gap against existing DB visits for this member+city
    const memberKey = `${owner.toLowerCase()}|${city.toLowerCase()}|${country.toLowerCase()}`;
    const existingDates = visitCache.get(memberKey) || [];
    const tooClose = existingDates.some((ed) => {
      const gap =
        Math.abs(new Date(visit_date).getTime() - new Date(ed).getTime()) /
        (1000 * 60 * 60 * 24);
      return gap < minGapDays;
    });

    if (tooClose) {
      return "skipped_dedup";
    }

    // Check exact date+city dedup
    const existing = await sql`
      SELECT id FROM visits
      WHERE visit_date = ${visit_date}
        AND lower(city) = ${city.toLowerCase()}
        AND country = ${country}
      LIMIT 1
    `;

    let visitId: string;
    if (existing.length > 0) {
      visitId = existing[0].id;
    } else {
      const inserted = await sql`
        INSERT INTO visits (user_id, visit_date, city, state, country, latitude, longitude)
        VALUES (${userId}, ${visit_date}, ${city}, ${state}, ${country}, ${lat}, ${lng})
        RETURNING id
      `;
      visitId = inserted[0].id;

      // Track this new visit in cache for subsequent rows
      if (!visitCache.has(memberKey)) visitCache.set(memberKey, []);
      visitCache.get(memberKey)!.push(visit_date);
    }

    // Link member (idempotent)
    const existingLink = await sql`
      SELECT visit_id FROM visit_members
      WHERE visit_id = ${visitId} AND family_member_id = ${memberId}
      LIMIT 1
    `;

    if (existingLink.length === 0) {
      await sql`
        INSERT INTO visit_members (visit_id, family_member_id)
        VALUES (${visitId}, ${memberId})
      `;
    }

    // If visit already existed (exact date+city match), it's a dedup
    if (existing.length > 0) {
      return "skipped_dedup";
    }

    return "inserted";
  },
};

export default adapter;
