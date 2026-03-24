import { notFound } from "next/navigation";
import sql from "@/lib/db";
import { getUserId } from "@/lib/auth";
import type { FamilyMember } from "@/lib/types/database";
import { VisitForm } from "@/components/visits/visit-form";
import { updateVisit } from "@/actions/visits";

export default async function EditVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getUserId();

  const [[visit], familyMembers] = await Promise.all([
    sql`
      SELECT v.*,
        COALESCE(
          (SELECT jsonb_agg(jsonb_build_object('family_member_id', vm.family_member_id))
           FROM visit_members vm WHERE vm.visit_id = v.id), '[]'::jsonb
        ) AS visit_members
      FROM visits v
      WHERE v.id = ${id}
    `,
    sql<FamilyMember[]>`SELECT * FROM family_members WHERE user_id = ${userId} ORDER BY name`,
  ]);

  if (!visit) notFound();

  const boundAction = updateVisit.bind(null, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Edit Visit</h1>
      <VisitForm
        visit={visit as any}
        familyMembers={familyMembers}
        action={boundAction}
      />
    </div>
  );
}
