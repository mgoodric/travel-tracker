"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { useTheme } from "next-themes";
import "leaflet/dist/leaflet.css";
import type { LatLngBoundsExpression, LatLngTuple } from "leaflet";

const DARK_TILES = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const LIGHT_TILES = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';
const PIN_COLOR = "oklch(0.65 0.2 260)";

export interface VisitPin {
  id: string;
  lat: number;
  lng: number;
  city: string;
  state: string | null;
  country: string;
  visitDate: string;
}

interface VisitMapProps {
  pins: VisitPin[];
  height?: string;
}

function ThemeTileLayer() {
  const { resolvedTheme } = useTheme();
  const [tileUrl, setTileUrl] = useState(DARK_TILES);

  useEffect(() => {
    setTileUrl(resolvedTheme === "dark" ? DARK_TILES : LIGHT_TILES);
  }, [resolvedTheme]);

  return <TileLayer attribution={ATTRIBUTION} url={tileUrl} />;
}

function FitPins({ pins }: { pins: VisitPin[] }) {
  const map = useMap();

  useEffect(() => {
    if (pins.length === 0) return;
    const points: LatLngTuple[] = pins.map((p) => [p.lat, p.lng]);
    map.fitBounds(points as LatLngBoundsExpression, { padding: [30, 30] });
  }, [map, pins]);

  return null;
}

export function VisitMap({ pins, height = "450px" }: VisitMapProps) {
  return (
    <div style={{ height }} className="relative rounded-lg overflow-hidden border">
      <MapContainer
        center={[39.8283, -98.5795]}
        zoom={4}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={true}
      >
        <ThemeTileLayer />
        <FitPins pins={pins} />

        {pins.map((pin) => {
          const location = [pin.city, pin.state, pin.country].filter(Boolean).join(", ");
          return (
            <CircleMarker
              key={pin.id}
              center={[pin.lat, pin.lng]}
              radius={6}
              pathOptions={{
                color: PIN_COLOR,
                fillColor: PIN_COLOR,
                fillOpacity: 0.8,
                weight: 2,
              }}
            >
              <Popup>
                <div className="text-sm">
                  <p className="font-bold">{location}</p>
                  <p className="text-muted-foreground">
                    {new Date(pin.visitDate).toLocaleDateString()}
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
