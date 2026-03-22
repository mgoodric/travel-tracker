import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface VisitCardProps {
  visit: {
    id: string;
    visit_date: string | null;
    city: string | null;
    state: string | null;
    country: string;
    notes: string | null;
    members?: { family_member: { name: string } }[];
  };
}

export function VisitCard({ visit }: VisitCardProps) {
  const location = [visit.city, visit.state, visit.country].filter(Boolean).join(", ");

  return (
    <Link href={`/visits/${visit.id}`}>
      <Card className="transition-colors hover:bg-muted">
        <CardContent className="flex items-center justify-between py-4">
          <div>
            <p className="font-semibold">{location}</p>
            {visit.notes && (
              <p className="text-sm text-muted-foreground line-clamp-1">{visit.notes}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {visit.members && visit.members.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {visit.members.map((m) => (
                  <Badge key={m.family_member.name} variant="outline" className="text-xs">
                    {m.family_member.name}
                  </Badge>
                ))}
              </div>
            )}
            <Badge variant="outline">
              {visit.visit_date ? new Date(visit.visit_date).toLocaleDateString() : "Date unknown"}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
