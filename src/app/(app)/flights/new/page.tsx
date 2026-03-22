import { createClient } from "@/lib/supabase/server";
import { FlightForm } from "@/components/flights/flight-form";
import { createFlight } from "@/actions/flights";

export default async function NewFlightPage() {
  const supabase = await createClient();
  const { data: familyMembers } = await supabase
    .from("family_members")
    .select("*")
    .order("name");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Log New Flight</h1>
      <FlightForm familyMembers={familyMembers || []} action={createFlight} />
    </div>
  );
}
