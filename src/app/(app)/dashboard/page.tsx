import { createClient } from "@/lib/supabase/server";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { MemberStatsCard } from "@/components/dashboard/member-stats-card";
import { FlightCard } from "@/components/flights/flight-card";
import { FlightMap } from "@/components/maps/flight-map-dynamic";
import { transformFlightsToRoutes, FLIGHT_MAP_SELECT } from "@/lib/flight-routes";

export default async function DashboardPage() {
  const supabase = await createClient();

  // Fetch all data in parallel
  const [{ data: memberStats }, { data: allFlights }, { data: recentFlights }] =
    await Promise.all([
      supabase.from("member_stats").select("*"),
      supabase.from("flights").select(FLIGHT_MAP_SELECT),
      supabase
        .from("flights")
        .select(`
          *,
          departure_airport:airports!departure_airport_id(*),
          arrival_airport:airports!arrival_airport_id(*),
          passengers:flight_passengers(family_member:family_members(name))
        `)
        .order("departure_date", { ascending: false })
        .limit(5),
    ]);

  // Aggregate totals
  const totals = {
    flights: memberStats?.reduce((sum, s) => sum + s.flight_count, 0) ?? 0,
    miles: memberStats?.reduce((sum, s) => sum + s.total_miles, 0) ?? 0,
    countries: memberStats?.reduce((max, s) => Math.max(max, s.unique_countries), 0) ?? 0,
    airports: memberStats?.reduce((max, s) => Math.max(max, s.unique_airports), 0) ?? 0,
  };

  const mapRoutes = transformFlightsToRoutes(allFlights || []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Your family travel overview</p>
      </div>

      <StatsGrid stats={totals} />

      {mapRoutes.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Flight Map</h2>
          <FlightMap routes={mapRoutes} height="450px" />
        </div>
      )}

      {memberStats && memberStats.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Family Members</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {memberStats.map((stat) => (
              <MemberStatsCard key={stat.family_member_id} stat={stat} />
            ))}
          </div>
        </div>
      )}

      {recentFlights && recentFlights.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Recent Flights</h2>
          <div className="space-y-4">
            {recentFlights.map((flight) => (
              <FlightCard key={flight.id} flight={flight} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
