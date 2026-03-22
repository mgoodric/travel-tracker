import { createClient } from "@/lib/supabase/server";
import { MemberCard } from "@/components/family/member-card";
import { MemberFormDialog } from "@/components/family/member-form";
import { EmptyState } from "@/components/shared/empty-state";

export default async function FamilyPage() {
  const supabase = await createClient();
  const [{ data: members }, { data: memberStats }] = await Promise.all([
    supabase.from("family_members").select("*").order("created_at", { ascending: true }),
    supabase.from("member_stats").select("*"),
  ]);

  const statsMap = new Map(
    (memberStats ?? []).map((s) => [s.family_member_id, s])
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

      {!members || members.length === 0 ? (
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
