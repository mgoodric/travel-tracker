import sql from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { FlightMap } from "@/components/maps/flight-map-dynamic";
import { transformFlightsToRoutes } from "@/lib/flight-routes";

export default async function MapPage() {
  const userId = await getUserId();

  const flights = await sql`
    SELECT f.id, f.category,
      jsonb_build_object('ident', da.ident, 'iata_code', da.iata_code, 'name', da.name, 'latitude', da.latitude, 'longitude', da.longitude) AS departure_airport,
      jsonb_build_object('ident', aa.ident, 'iata_code', aa.iata_code, 'name', aa.name, 'latitude', aa.latitude, 'longitude', aa.longitude) AS arrival_airport
    FROM flights f
    JOIN airports da ON da.id = f.departure_airport_id
    JOIN airports aa ON aa.id = f.arrival_airport_id
    WHERE f.user_id = ${userId}
  `;

  const routes = transformFlightsToRoutes(flights);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Flight Map</h1>
        <p className="text-sm text-muted-foreground">
          {routes.length} flights across {new Set(routes.flatMap(r => [r.departure.code, r.arrival.code])).size} airports
        </p>
      </div>
      <FlightMap routes={routes} height="calc(100vh - 200px)" />
    </div>
  );
}
