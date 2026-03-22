"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, GeoJSON, useMap } from "react-leaflet";
import { useTheme } from "next-themes";
import "leaflet/dist/leaflet.css";
import type { Layer, PathOptions } from "leaflet";
import type { Feature, FeatureCollection } from "geojson";

interface ChoroplethMapProps {
  geoJsonUrl: string;
  visitedCodes: Set<string>;
  featureCodeProperty: string;
  featureNameProperty: string;
  height?: string;
}

const DARK_VISITED = "oklch(0.55 0.15 250)";
const DARK_UNVISITED = "oklch(0.25 0.0 0)";
const DARK_BORDER = "oklch(0.35 0.0 0)";
const LIGHT_VISITED = "oklch(0.65 0.15 250)";
const LIGHT_UNVISITED = "oklch(0.92 0.0 0)";
const LIGHT_BORDER = "oklch(0.75 0.0 0)";

function FitGeo({ data }: { data: FeatureCollection | null }) {
  const map = useMap();
  useEffect(() => {
    if (!data) return;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const L = require("leaflet");
    const layer = L.geoJSON(data);
    const bounds = layer.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [10, 10] });
    }
  }, [map, data]);
  return null;
}

export function ChoroplethMap({
  geoJsonUrl,
  visitedCodes,
  featureCodeProperty,
  featureNameProperty,
  height = "350px",
}: ChoroplethMapProps) {
  const { resolvedTheme } = useTheme();
  const [geoData, setGeoData] = useState<FeatureCollection | null>(null);
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    fetch(geoJsonUrl)
      .then((r) => r.json())
      .then((d) => setGeoData(d))
      .catch(() => {});
  }, [geoJsonUrl]);

  const colors = useMemo(
    () => ({
      visited: isDark ? DARK_VISITED : LIGHT_VISITED,
      unvisited: isDark ? DARK_UNVISITED : LIGHT_UNVISITED,
      border: isDark ? DARK_BORDER : LIGHT_BORDER,
    }),
    [isDark]
  );

  const style = useMemo(
    () =>
      (feature?: Feature): PathOptions => {
        if (!feature) return {};
        const code = feature.properties?.[featureCodeProperty] as string;
        const visited = visitedCodes.has(code);
        return {
          fillColor: visited ? colors.visited : colors.unvisited,
          weight: 1,
          color: colors.border,
          fillOpacity: visited ? 0.7 : 0.3,
        };
      },
    [visitedCodes, featureCodeProperty, colors]
  );

  const onEachFeature = useMemo(
    () =>
      (feature: Feature, layer: Layer) => {
        const name = feature.properties?.[featureNameProperty] as string;
        const code = feature.properties?.[featureCodeProperty] as string;
        const visited = visitedCodes.has(code);
        layer.bindTooltip(
          `${name}${visited ? " ✓" : ""}`,
          { sticky: true }
        );
      },
    [featureNameProperty, featureCodeProperty, visitedCodes]
  );

  if (!geoData) {
    return <div style={{ height }} className="rounded-lg border bg-muted animate-pulse" />;
  }

  return (
    <div style={{ height }} className="relative rounded-lg overflow-hidden border">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
        zoomControl={false}
      >
        <FitGeo data={geoData} />
        <GeoJSON
          key={`${isDark}-${Array.from(visitedCodes).join(",")}`}
          data={geoData}
          style={style}
          onEachFeature={onEachFeature}
        />
      </MapContainer>
    </div>
  );
}
