import sql from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { StatsGrid } from "@/components/dashboard/stats-grid";
import { MemberStatsCard } from "@/components/dashboard/member-stats-card";
import { FlightCard } from "@/components/flights/flight-card";
import { FlightMap } from "@/components/maps/flight-map-dynamic";
import { transformFlightsToRoutes } from "@/lib/flight-routes";
import type { MemberStats } from "@/lib/types/database";

export default async function DashboardPage() {
  const userId = await getUserId();

  const [memberStats, mapFlights, recentFlights] = await Promise.all([
    sql<MemberStats[]>`SELECT ms.* FROM member_stats ms JOIN family_members fm ON fm.id = ms.family_member_id WHERE fm.user_id = ${userId}`,
    sql`
      SELECT f.id, f.category,
        jsonb_build_object('ident', da.ident, 'iata_code', da.iata_code, 'name', da.name, 'latitude', da.latitude, 'longitude', da.longitude) AS departure_airport,
        jsonb_build_object('ident', aa.ident, 'iata_code', aa.iata_code, 'name', aa.name, 'latitude', aa.latitude, 'longitude', aa.longitude) AS arrival_airport
      FROM flights f
      JOIN airports da ON da.id = f.departure_airport_id
      JOIN airports aa ON aa.id = f.arrival_airport_id
      WHERE f.user_id = ${userId}
    `,
    sql`
      SELECT f.*,
        jsonb_build_object('id', da.id, 'ident', da.ident, 'iata_code', da.iata_code, 'name', da.name, 'latitude', da.latitude, 'longitude', da.longitude, 'elevation_ft', da.elevation_ft, 'type', da.type, 'municipality', da.municipality, 'iso_country', da.iso_country, 'iso_region', da.iso_region) AS departure_airport,
        jsonb_build_object('id', aa.id, 'ident', aa.ident, 'iata_code', aa.iata_code, 'name', aa.name, 'latitude', aa.latitude, 'longitude', aa.longitude, 'elevation_ft', aa.elevation_ft, 'type', aa.type, 'municipality', aa.municipality, 'iso_country', aa.iso_country, 'iso_region', aa.iso_region) AS arrival_airport,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('family_member', jsonb_build_object('name', fm.name)))
           FROM flight_passengers fp JOIN family_members fm ON fm.id = fp.family_member_id
           WHERE fp.flight_id = f.id), '[]'::jsonb
        ) AS passengers
      FROM flights f
      JOIN airports da ON da.id = f.departure_airport_id
      JOIN airports aa ON aa.id = f.arrival_airport_id
      WHERE f.user_id = ${userId}
      ORDER BY f.departure_date DESC
      LIMIT 5
    `,
  ]);

  const totals = {
    flights: memberStats.reduce((sum, s) => sum + Number(s.flight_count), 0),
    miles: memberStats.reduce((sum, s) => sum + Number(s.total_miles), 0),
    countries: memberStats.reduce((max, s) => Math.max(max, Number(s.unique_countries)), 0),
    airports: memberStats.reduce((max, s) => Math.max(max, Number(s.unique_airports)), 0),
  };

  const mapRoutes = transformFlightsToRoutes(mapFlights);

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

      {memberStats.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Family Members</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {memberStats.map((stat) => (
              <MemberStatsCard key={stat.family_member_id} stat={stat} />
            ))}
          </div>
        </div>
      )}

      {recentFlights.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold">Recent Flights</h2>
          <div className="space-y-4">
            {recentFlights.map((flight) => (
              <FlightCard key={flight.id} flight={flight as any} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
