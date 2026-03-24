# Family Member Detail Pages — Implementation Plan

## Context
Family members are currently non-interactive cards on `/family`. This plan adds clickable detail pages at `/family/[id]` with per-member travel statistics, a flight map, US state choropleth (visited states highlighted), world country choropleth (visited countries highlighted), and recent flights/visits lists.

## Approach

### 1. Make MemberCard Clickable
**File:** `src/components/family/member-card.tsx`
- Wrap card in `<Link href={/family/${member.id}}>` with hover state
- Keep Edit/Delete buttons with `e.stopPropagation()` to prevent nav conflicts

### 2. Create Detail Page
**New file:** `src/app/(app)/family/[id]/page.tsx`

**Data fetched in parallel via Promise.all:**
- Member info: `family_members` by id
- Member's flights via `flight_passengers` join → `flights` with airport data
- Member's visits via `visit_members` join → `visits`

**Stats computed server-side from query results (no extra DB view needed):**
- GA flights count, commercial flights count
- Total miles, unique aircraft types, unique airlines
- States visited, countries visited, unique airports
- Total visits count, first/last flight dates

**Layout (top to bottom):**
1. Header: back link + name + relationship badge
2. Stats grid (responsive 2→3→5 columns)
3. Flight map (reuse `FlightMap` with member's routes only)
4. Two choropleth maps side by side on lg+ (stacked on mobile)
5. Recent flights (10) using `FlightCard`
6. Recent visits (10) using `VisitCard`

### 3. Choropleth Map Component
**New files:** `src/components/maps/choropleth-map.tsx` + `choropleth-map-dynamic.tsx`

Single reusable component for both US states and world:
```
ChoroplethMapProps {
  geoJsonUrl: string          // "/geo/us-states.json" or "/geo/world-countries.json"
  visitedCodes: Set<string>   // {"WA","OR"} or {"USA","CAN"}
  featureCodeProperty: string // "STUSPS" or "ISO_A3"
  height, center, zoom
}
```

- Uses react-leaflet's built-in `GeoJSON` component (no new deps)
- `fetch()` GeoJSON from `/public/geo/` at runtime (not bundled in JS)
- Theme-aware: visited = blue accent, unvisited = dark gray (dark mode) / light gray (light mode)
- Hover tooltip shows state/country name
- Dynamic import wrapper with `ssr: false`

### 4. GeoJSON Data
**New files:** `public/geo/us-states.json`, `public/geo/world-countries.json`

- Source: Natural Earth 110m simplified — lightweight (~200-350KB each)
- US states keyed by `STUSPS` (2-letter abbreviation: "WA")
- World countries keyed by `ISO_A3` (3-letter code: "USA")

### 5. Code Mappings
**New files:** `src/lib/geo/country-name-to-iso.ts`, `src/lib/geo/us-state-codes.ts`

- Visit `country` (free text "United States") → ISO-3 ("USA") for world GeoJSON matching
- Visit `state` (free text "Washington") → abbreviation ("WA") for US GeoJSON matching
- Airport `iso_region` ("US-WA") → split to "WA" for US state matching
- Airport `iso_country` ("US") already usable for world matching (just convert 2→3 letter)

### 6. Reused Components
- `FlightMap` from `src/components/maps/flight-map-dynamic.tsx` — member's flights only
- `FlightCard` from `src/components/flights/flight-card.tsx` — recent flights list
- `VisitCard` from `src/components/visits/visit-card.tsx` — recent visits list
- `transformFlightsToRoutes` from `src/lib/flight-routes.ts` — build map routes

## Files Summary

| Action | File |
|--------|------|
| New | `src/app/(app)/family/[id]/page.tsx` |
| New | `src/components/maps/choropleth-map.tsx` |
| New | `src/components/maps/choropleth-map-dynamic.tsx` |
| New | `src/components/family/member-detail-stats.tsx` |
| New | `src/lib/geo/country-name-to-iso.ts` |
| New | `src/lib/geo/us-state-codes.ts` |
| New | `public/geo/us-states.json` |
| New | `public/geo/world-countries.json` |
| Modify | `src/components/family/member-card.tsx` (add Link wrapper) |

## Verification
1. `npx next build` passes with zero TypeScript errors
2. Navigate `/family` → click member → `/family/[id]` loads
3. Stats grid shows correct counts (cross-check with dashboard member_stats)
4. Flight map shows only that member's routes with GA/commercial colors
5. US state map highlights visited states, hover shows state name
6. World map highlights visited countries, hover shows country name
7. Both maps render correctly in dark and light mode
8. Recent flights and visits lists show correct data
9. No new npm dependencies in package.json
