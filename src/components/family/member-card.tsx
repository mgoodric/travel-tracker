"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MemberFormDialog } from "./member-form";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { deleteFamilyMember } from "@/actions/family";
import type { FamilyMember, MemberStats } from "@/lib/types/database";

interface MemberCardProps {
  member: FamilyMember;
  stats?: MemberStats;
}

export function MemberCard({ member, stats }: MemberCardProps) {
  const router = useRouter();

  async function handleDelete() {
    await deleteFamilyMember(member.id);
    router.refresh();
  }

  return (
    <Link href={`/family/${member.id}`}>
      <Card className="transition-colors hover:bg-muted">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg">{member.name}</CardTitle>
          <Badge variant="secondary">{member.relationship}</Badge>
        </CardHeader>
        {stats && (
          <CardContent className="pb-2">
            <div className="grid grid-cols-4 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Flights</p>
                <p className="font-semibold">{stats.flight_count}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Miles</p>
                <p className="font-semibold">{stats.total_miles.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Countries</p>
                <p className="font-semibold">{stats.unique_countries}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Airports</p>
                <p className="font-semibold">{stats.unique_airports}</p>
              </div>
            </div>
          </CardContent>
        )}
        <CardContent className="flex gap-2 pt-0" onClick={(e) => e.stopPropagation()}>
          <MemberFormDialog
            member={member}
            trigger={<Button variant="outline" size="sm">Edit</Button>}
          />
          <ConfirmDialog
            title="Delete Member"
            description={`Are you sure you want to remove ${member.name}? This will also remove them from all flights and visits.`}
            onConfirm={handleDelete}
            trigger={<Button variant="destructive" size="sm">Delete</Button>}
          />
        </CardContent>
      </Card>
    </Link>
  );
}
