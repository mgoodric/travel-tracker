import Link from "next/link";
import sql from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { FlightCard } from "@/components/flights/flight-card";
import { EmptyState } from "@/components/shared/empty-state";

export default async function FlightsPage() {
  const userId = await getUserId();

  const flights = await sql`
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
  `;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Flights</h1>
          <p className="text-sm text-muted-foreground">Your flight log</p>
        </div>
        <Link href="/flights/new">
          <Button>Add Flight</Button>
        </Link>
      </div>

      {flights.length === 0 ? (
        <EmptyState
          title="No flights logged"
          description="Start logging your flights to track your travel stats."
          action={
            <Link href="/flights/new">
              <Button>Log Your First Flight</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {flights.map((flight) => (
            <FlightCard key={flight.id} flight={flight as any} />
          ))}
        </div>
      )}
    </div>
  );
}
