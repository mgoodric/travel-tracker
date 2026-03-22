import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteVisitButton } from "@/components/visits/delete-visit-button";

export default async function VisitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: visit } = await supabase
    .from("visits")
    .select(`
      *,
      visit_members(
        family_member:family_members(*)
      )
    `)
    .eq("id", id)
    .single();

  if (!visit) notFound();

  const location = [visit.city, visit.state, visit.country].filter(Boolean).join(", ");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Visit Details</h1>
        <div className="flex gap-2">
          <Link href={`/visits/${id}/edit`}>
            <Button variant="outline">Edit</Button>
          </Link>
          <DeleteVisitButton visitId={id} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{location}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Date</p>
              <p>{new Date(visit.visit_date).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Country</p>
              <p>{visit.country}</p>
            </div>
            {visit.state && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">State / Region</p>
                <p>{visit.state}</p>
              </div>
            )}
            {visit.city && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">City</p>
                <p>{visit.city}</p>
              </div>
            )}
          </div>

          {visit.notes && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Notes</p>
              <p>{visit.notes}</p>
            </div>
          )}

          {visit.visit_members && visit.visit_members.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium text-muted-foreground">Family Members</p>
              <div className="flex flex-wrap gap-2">
                {visit.visit_members.map((vm: { family_member: { id: string; name: string } }) => (
                  <Badge key={vm.family_member.id} variant="outline">
                    {vm.family_member.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
