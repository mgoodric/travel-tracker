import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { VisitCard } from "@/components/visits/visit-card";
import { VisitMap } from "@/components/maps/visit-map-dynamic";
import { EmptyState } from "@/components/shared/empty-state";
import type { VisitPin } from "@/components/maps/visit-map-dynamic";

export default async function VisitsPage() {
  const supabase = await createClient();
  const { data: visits } = await supabase
    .from("visits")
    .select(`
      *,
      members:visit_members(family_member:family_members(name))
    `)
    .order("visit_date", { ascending: false });

  // Build map pins from visits with coordinates
  const pins: VisitPin[] = (visits ?? [])
    .filter((v) => v.latitude && v.longitude)
    .map((v) => ({
      id: v.id,
      lat: v.latitude!,
      lng: v.longitude!,
      city: v.city || "",
      state: v.state,
      country: v.country,
      visitDate: v.visit_date,
    }));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Visits</h1>
          <p className="text-sm text-muted-foreground">Non-flight travel log</p>
        </div>
        <Link href="/visits/new">
          <Button>Add Visit</Button>
        </Link>
      </div>

      {!visits || visits.length === 0 ? (
        <EmptyState
          title="No visits logged"
          description="Track road trips, cruises, and other non-flight travel."
          action={
            <Link href="/visits/new">
              <Button>Log Your First Visit</Button>
            </Link>
          }
        />
      ) : (
        <>
          {pins.length > 0 && (
            <div>
              <h2 className="mb-3 text-lg font-semibold">Visit Map</h2>
              <VisitMap pins={pins} height="450px" />
            </div>
          )}

          <div className="space-y-4">
            {visits.map((visit) => (
              <VisitCard key={visit.id} visit={visit} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
