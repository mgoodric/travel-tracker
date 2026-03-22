import { createClient } from "@/lib/supabase/server";
import { VisitForm } from "@/components/visits/visit-form";
import { createVisit } from "@/actions/visits";

export default async function NewVisitPage() {
  const supabase = await createClient();
  const { data: familyMembers } = await supabase
    .from("family_members")
    .select("*")
    .order("name");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Log New Visit</h1>
      <VisitForm familyMembers={familyMembers || []} action={createVisit} />
    </div>
  );
}
