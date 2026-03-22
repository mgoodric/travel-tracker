import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MemberStats } from "@/lib/types/database";

interface MemberStatsCardProps {
  stat: MemberStats;
}

export function MemberStatsCard({ stat }: MemberStatsCardProps) {
  return (
    <Link href={`/family/${stat.family_member_id}`}>
      <Card className="transition-colors hover:bg-muted">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{stat.member_name}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <p className="text-muted-foreground">Flights</p>
              <p className="font-semibold">{stat.flight_count}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Miles</p>
              <p className="font-semibold">{stat.total_miles.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Countries</p>
              <p className="font-semibold">{stat.unique_countries}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Airports</p>
              <p className="font-semibold">{stat.unique_airports}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
