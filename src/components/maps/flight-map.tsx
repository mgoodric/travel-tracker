"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, CircleMarker, Popup, useMap } from "react-leaflet";
import { useTheme } from "next-themes";
import "leaflet/dist/leaflet.css";
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet";
import type { FlightRoute } from "@/lib/flight-routes";
import { ROUTE_COLORS } from "@/lib/flight-routes";
import type { FlightCategory } from "@/lib/types/database";

interface FlightMapProps {
  routes: FlightRoute[];
  height?: string;
  showLegend?: boolean;
}

// Generate great circle arc points, split into segments at the antimeridian
function greatCircleArc(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  numPoints = 50
): LatLngTuple[][] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const φ1 = toRad(lat1);
  const λ1 = toRad(lon1);
  const φ2 = toRad(lat2);
  const λ2 = toRad(lon2);

  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((φ2 - φ1) / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2
    )
  );

  if (d < 0.0001) return [[[lat1, lon1], [lat2, lon2]]];

  const points: LatLngTuple[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const f = i / numPoints;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    const lng = toDeg(Math.atan2(y, x));
    points.push([lat, lng]);
  }

  // Split at antimeridian crossings (longitude jumps > 180°)
  const segments: LatLngTuple[][] = [];
  let current: LatLngTuple[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prevLng = points[i - 1][1];
    const currLng = points[i][1];

    if (Math.abs(currLng - prevLng) > 180) {
      // Interpolate the crossing point at ±180
      const sign = prevLng > 0 ? 1 : -1;
      const dLng = currLng - prevLng + (prevLng > 0 ? -360 : 360);
      const ratio = (sign * 180 - prevLng) / dLng;
      const crossLat = points[i - 1][0] + ratio * (points[i][0] - points[i - 1][0]);

      current.push([crossLat, sign * 180]);
      segments.push(current);
      current = [[crossLat, -sign * 180]];
    }

    current.push(points[i]);
  }

  segments.push(current);
  return segments;
}

const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';
const MIXED_COLOR = "oklch(0.75 0.0 0)"; // neutral white-ish for airports serving both

// Component to auto-fit bounds when routes change
function FitBounds({ routes }: { routes: FlightRoute[] }) {
  const map = useMap();

  useEffect(() => {
    if (routes.length === 0) return;

    const allPoints: LatLngTuple[] = [];
    for (const route of routes) {
      allPoints.push([route.departure.lat, route.departure.lng]);
      allPoints.push([route.arrival.lat, route.arrival.lng]);
    }

    if (allPoints.length > 0) {
      map.fitBounds(allPoints as LatLngBoundsExpression, { padding: [30, 30] });
    }
  }, [map, routes]);

  return null;
}

// Theme-aware tile layer
function ThemeTileLayer() {
  const { resolvedTheme } = useTheme();
  const [tileUrl, setTileUrl] = useState(DARK_TILES);

  useEffect(() => {
    setTileUrl(resolvedTheme === "dark" ? DARK_TILES : LIGHT_TILES);
  }, [resolvedTheme]);

  return <TileLayer attribution={ATTRIBUTION} url={tileUrl} />;
}

function routeKey(r: FlightRoute) {
  const codes = [r.departure.code, r.arrival.code].sort();
  return codes.join("-");
}

const CATEGORY_LABELS: Record<FlightCategory, string> = {
  commercial: "Commercial",
  general_aviation: "General Aviation",
};

function MapLegend({ categories }: { categories: Set<FlightCategory> }) {
  if (categories.size <= 1) return null;

  return (
    <div className="absolute bottom-6 left-3 z-[1000] rounded-md bg-background/90 px-3 py-2 text-xs shadow-md backdrop-blur-sm border">
      <div className="flex flex-col gap-1.5">
        {Array.from(categories).map((cat) => (
          <div key={cat} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-5 rounded-sm"
              style={{ backgroundColor: ROUTE_COLORS[cat] }}
            />
            <span className="text-muted-foreground">{CATEGORY_LABELS[cat]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FlightMap({ routes, height = "400px", showLegend = true }: FlightMapProps) {
  const { airports, airportCategories } = useMemo(() => {
    const map = new Map<string, FlightRoute["departure"]>();
    const catMap = new Map<string, Set<FlightCategory>>();
    for (const route of routes) {
      if (!map.has(route.departure.code)) map.set(route.departure.code, route.departure);
      if (!map.has(route.arrival.code)) map.set(route.arrival.code, route.arrival);
      // Track which categories each airport serves
      if (!catMap.has(route.departure.code)) catMap.set(route.departure.code, new Set());
      catMap.get(route.departure.code)!.add(route.category);
      if (!catMap.has(route.arrival.code)) catMap.set(route.arrival.code, new Set());
      catMap.get(route.arrival.code)!.add(route.category);
    }
    return { airports: Array.from(map.values()), airportCategories: catMap };
  }, [routes]);

  const { uniqueRoutes, routeCounts } = useMemo(() => {
    const seen = new Set<string>();
    const unique = routes.filter((r) => {
      const key = routeKey(r);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const counts = new Map<string, number>();
    for (const r of routes) {
      const key = routeKey(r);
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return { uniqueRoutes: unique, routeCounts: counts };
  }, [routes]);

  const arcData = useMemo(
    () =>
      uniqueRoutes.map((route) => ({
        key: routeKey(route),
        count: routeCounts.get(routeKey(route)) || 1,
        category: route.category,
        segments: greatCircleArc(
          route.departure.lat,
          route.departure.lng,
          route.arrival.lat,
          route.arrival.lng,
          30
        ),
      })),
    [uniqueRoutes, routeCounts]
  );

  const presentCategories = useMemo(
    () => new Set(routes.map((r) => r.category)),
    [routes]
  );

  const airportColor = useCallback((code: string): string => {
    const cats = airportCategories.get(code);
    if (!cats || cats.size === 0) return ROUTE_COLORS.commercial;
    if (cats.size > 1) return MIXED_COLOR;
    return ROUTE_COLORS[Array.from(cats)[0]];
  }, [airportCategories]);

  return (
    <div style={{ height }} className="relative rounded-lg overflow-hidden border">
      <MapContainer
        center={[39.8283, -98.5795]}
        zoom={4}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
      >
        <ThemeTileLayer />
        <FitBounds routes={routes} />

        {/* Flight path arcs */}
        {arcData.map((arc) =>
          arc.segments.map((segment, i) => (
            <Polyline
              key={`${arc.key}-${i}`}
              positions={segment}
              pathOptions={{
                color: ROUTE_COLORS[arc.category],
                weight: Math.min(1 + Math.log2(arc.count), 4),
                opacity: 0.6,
              }}
            />
          ))
        )}

        {/* Airport markers */}
        {airports.map((airport) => {
          const color = airportColor(airport.code);
          return (
            <CircleMarker
              key={airport.code}
              center={[airport.lat, airport.lng]}
              radius={5}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: 0.9,
                weight: 1,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-bold">{airport.code}</p>
                  <p>{airport.name}</p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      {showLegend && <MapLegend categories={presentCategories} />}
    </div>
  );
}
