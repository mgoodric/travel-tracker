import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { FlightCard } from "@/components/flights/flight-card";
import { EmptyState } from "@/components/shared/empty-state";

export default async function FlightsPage() {
  const supabase = await createClient();
  const { data: flights } = await supabase
    .from("flights")
    .select(`
      *,
      departure_airport:airports!departure_airport_id(*),
      arrival_airport:airports!arrival_airport_id(*),
      passengers:flight_passengers(family_member:family_members(name))
    `)
    .order("departure_date", { ascending: false });

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

      {!flights || flights.length === 0 ? (
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
            <FlightCard key={flight.id} flight={flight} />
          ))}
        </div>
      )}
    </div>
  );
}
