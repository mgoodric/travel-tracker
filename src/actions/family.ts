"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createFamilyMember(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = formData.get("name") as string;
  const relationship = formData.get("relationship") as string;

  const { error } = await supabase.from("family_members").insert({
    user_id: user.id,
    name,
    relationship,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/family");
}

export async function updateFamilyMember(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = formData.get("name") as string;
  const relationship = formData.get("relationship") as string;

  const { error } = await supabase
    .from("family_members")
    .update({ name, relationship, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/family");
}

export async function deleteFamilyMember(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("family_members")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/family");
}
