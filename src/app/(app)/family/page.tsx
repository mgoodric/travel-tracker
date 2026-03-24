import sql from "@/lib/db";
import { getUserId } from "@/lib/auth";
import { MemberCard } from "@/components/family/member-card";
import { MemberFormDialog } from "@/components/family/member-form";
import { EmptyState } from "@/components/shared/empty-state";
import type { FamilyMember, MemberStats } from "@/lib/types/database";

export default async function FamilyPage() {
  const userId = await getUserId();

  const [members, memberStats] = await Promise.all([
    sql<FamilyMember[]>`SELECT * FROM family_members WHERE user_id = ${userId} ORDER BY created_at ASC`,
    sql<MemberStats[]>`SELECT ms.* FROM member_stats ms JOIN family_members fm ON fm.id = ms.family_member_id WHERE fm.user_id = ${userId}`,
  ]);

  const statsMap = new Map(
    memberStats.map((s) => [s.family_member_id, s])
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Family Members</h1>
          <p className="text-sm text-muted-foreground">Manage your family members for travel tracking</p>
        </div>
        <MemberFormDialog />
      </div>

      {members.length === 0 ? (
        <EmptyState
          title="No family members yet"
          description="Add your family members to start tracking who travels where."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member) => (
            <MemberCard key={member.id} member={member} stats={statsMap.get(member.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
