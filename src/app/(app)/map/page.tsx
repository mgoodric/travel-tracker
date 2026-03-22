import { createClient } from "@/lib/supabase/server";
import { FlightMap } from "@/components/maps/flight-map-dynamic";
import { transformFlightsToRoutes, FLIGHT_MAP_SELECT } from "@/lib/flight-routes";

export default async function MapPage() {
  const supabase = await createClient();

  const { data: flights } = await supabase
    .from("flights")
    .select(FLIGHT_MAP_SELECT);

  const routes = transformFlightsToRoutes(flights || []);

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
