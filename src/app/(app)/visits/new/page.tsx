import sql from "@/lib/db";
import { getUserId } from "@/lib/auth";
import type { FamilyMember } from "@/lib/types/database";
import { VisitForm } from "@/components/visits/visit-form";
import { createVisit } from "@/actions/visits";

export default async function NewVisitPage() {
  const userId = await getUserId();

  const familyMembers = await sql<FamilyMember[]>`
    SELECT * FROM family_members WHERE user_id = ${userId} ORDER BY name
  `;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Log New Visit</h1>
      <VisitForm familyMembers={familyMembers} action={createVisit} />
    </div>
  );
}
