import type { FlightCategory } from "@/lib/types/database";

export interface FlightRoute {
  id: string;
  category: FlightCategory;
  departure: {
    lat: number;
    lng: number;
    code: string;
    name: string;
  };
  arrival: {
    lat: number;
    lng: number;
    code: string;
    name: string;
  };
}

export const ROUTE_COLORS: Record<FlightCategory, string> = {
  commercial: "oklch(0.7 0.15 250)",   // blue
  general_aviation: "oklch(0.7 0.2 150)", // green
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function transformFlightsToRoutes(flights: any[]): FlightRoute[] {
  return flights
    .filter((f) => f.departure_airport && f.arrival_airport)
    .map((f) => ({
      id: f.id,
      category: f.category as FlightCategory,
      departure: {
        lat: f.departure_airport.latitude,
        lng: f.departure_airport.longitude,
        code: f.departure_airport.iata_code || f.departure_airport.ident,
        name: f.departure_airport.name,
      },
      arrival: {
        lat: f.arrival_airport.latitude,
        lng: f.arrival_airport.longitude,
        code: f.arrival_airport.iata_code || f.arrival_airport.ident,
        name: f.arrival_airport.name,
      },
    }));
}
