"use server";

import { revalidatePath } from "next/cache";
import sql from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function createFamilyMember(formData: FormData) {
  const userId = await getUserId();

  const name = formData.get("name") as string;
  const relationship = formData.get("relationship") as string;

  await sql`
    INSERT INTO family_members (user_id, name, relationship)
    VALUES (${userId}, ${name}, ${relationship})
  `;

  revalidatePath("/family");
}

export async function updateFamilyMember(id: string, formData: FormData) {
  await getUserId();

  const name = formData.get("name") as string;
  const relationship = formData.get("relationship") as string;

  await sql`
    UPDATE family_members
    SET name = ${name}, relationship = ${relationship}, updated_at = now()
    WHERE id = ${id}
  `;

  revalidatePath("/family");
}

export async function deleteFamilyMember(id: string) {
  await getUserId();
  await sql`DELETE FROM family_members WHERE id = ${id}`;
  revalidatePath("/family");
}
