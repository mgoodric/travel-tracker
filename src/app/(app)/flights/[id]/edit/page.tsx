import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FlightForm } from "@/components/flights/flight-form";
import { updateFlight } from "@/actions/flights";

export default async function EditFlightPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [flightResult, membersResult] = await Promise.all([
    supabase
      .from("flights")
      .select(`
        *,
        departure_airport:airports!departure_airport_id(*),
        arrival_airport:airports!arrival_airport_id(*),
        flight_passengers(role, family_member_id)
      `)
      .eq("id", id)
      .single(),
    supabase.from("family_members").select("*").order("name"),
  ]);

  const flight = flightResult.data;
  if (!flight) notFound();

  const familyMembers = membersResult.data;

  const boundAction = updateFlight.bind(null, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Edit Flight</h1>
      <FlightForm
        flight={flight}
        familyMembers={familyMembers || []}
        action={boundAction}
      />
    </div>
  );
}
