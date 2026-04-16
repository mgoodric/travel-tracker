import { notFound } from "next/navigation";
import sql from "@/lib/db";
import { getUserId } from "@/lib/auth";
import type { FamilyMember } from "@/lib/types/database";
import { FlightForm } from "@/components/flights/flight-form";
import { updateFlight } from "@/actions/flights";

export default async function EditFlightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getUserId();

  const [[flight], familyMembers] = await Promise.all([
    sql`
      SELECT f.*,
        jsonb_build_object('id', da.id, 'ident', da.ident, 'iata_code', da.iata_code, 'name', da.name, 'latitude', da.latitude, 'longitude', da.longitude, 'elevation_ft', da.elevation_ft, 'type', da.type, 'municipality', da.municipality, 'iso_country', da.iso_country, 'iso_region', da.iso_region) AS departure_airport,
        jsonb_build_object('id', aa.id, 'ident', aa.ident, 'iata_code', aa.iata_code, 'name', aa.name, 'latitude', aa.latitude, 'longitude', aa.longitude, 'elevation_ft', aa.elevation_ft, 'type', aa.type, 'municipality', aa.municipality, 'iso_country', aa.iso_country, 'iso_region', aa.iso_region) AS arrival_airport,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('role', fp.role, 'family_member_id', fp.family_member_id))
           FROM flight_passengers fp WHERE fp.flight_id = f.id), '[]'::jsonb
        ) AS flight_passengers
      FROM flights f
      JOIN airports da ON da.id = f.departure_airport_id
      JOIN airports aa ON aa.id = f.arrival_airport_id
      WHERE f.id = ${id}
    `,
    sql<FamilyMember[]>`SELECT * FROM family_members WHERE user_id = ${userId} ORDER BY name`,
  ]);

  if (!flight) notFound();

  // postgres.js returns DATE columns as Date objects; the form needs YYYY-MM-DD strings
  const departureDateStr =
    flight.departure_date instanceof Date
      ? flight.departure_date.toISOString().slice(0, 10)
      : String(flight.departure_date).slice(0, 10);

  const boundAction = updateFlight.bind(null, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Edit Flight</h1>
      <FlightForm
        flight={{ ...flight, departure_date: departureDateStr } as any}
        familyMembers={familyMembers as any}
        action={boundAction}
      />
    </div>
  );
}
