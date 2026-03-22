import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VisitForm } from "@/components/visits/visit-form";
import { updateVisit } from "@/actions/visits";

export default async function EditVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [visitResult, membersResult] = await Promise.all([
    supabase
      .from("visits")
      .select(`
        *,
        visit_members(family_member_id)
      `)
      .eq("id", id)
      .single(),
    supabase.from("family_members").select("*").order("name"),
  ]);

  const visit = visitResult.data;
  if (!visit) notFound();

  const familyMembers = membersResult.data;

  const boundAction = updateVisit.bind(null, id);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Edit Visit</h1>
      <VisitForm
        visit={visit}
        familyMembers={familyMembers || []}
        action={boundAction}
      />
    </div>
  );
}
