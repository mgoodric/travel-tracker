"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import sql, { transaction } from "@/lib/db";
import { getUserId } from "@/lib/auth";

async function geocode(city: string | null, state: string | null, country: string): Promise<{ lat: number; lng: number } | null> {
  const q = [city, state, country].filter(Boolean).join(", ");
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`,
      { headers: { "User-Agent": "TravelTracker/1.0" } }
    );
    const data = await res.json();
    if (data.length > 0) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch { /* ignore */ }
  return null;
}

export async function createVisit(formData: FormData) {
  const userId = await getUserId();

  const unknownDate = formData.get("unknown_date") === "on";
  const visitDate = unknownDate ? null : (formData.get("visit_date") as string);
  const country = formData.get("country") as string;
  const state = formData.get("state") as string || null;
  const city = formData.get("city") as string || null;
  const notes = formData.get("notes") as string || null;

  const coords = await geocode(city, state, country);

  await transaction(async (tx) => {
    const [visit] = await tx`
      INSERT INTO visits (user_id, visit_date, country, state, city, notes, latitude, longitude)
      VALUES (${userId}, ${visitDate}, ${country}, ${state}, ${city}, ${notes}, ${coords?.lat ?? null}, ${coords?.lng ?? null})
      RETURNING id
    `;

    const membersJson = formData.get("members") as string;
    if (membersJson) {
      const memberIds = JSON.parse(membersJson) as string[];
      if (memberIds.length > 0) {
        await tx`
          INSERT INTO visit_members ${tx(
            memberIds.map(mid => ({ visit_id: visit.id, family_member_id: mid }))
          )}
        `;
      }
    }
  });

  revalidatePath("/visits");
  redirect("/visits");
}

export async function updateVisit(id: string, formData: FormData) {
  await getUserId();

  const unknownDate = formData.get("unknown_date") === "on";
  const visitDate = unknownDate ? null : (formData.get("visit_date") as string);
  const country = formData.get("country") as string;
  const state = formData.get("state") as string || null;
  const city = formData.get("city") as string || null;
  const notes = formData.get("notes") as string || null;

  const coords = await geocode(city, state, country);

  await transaction(async (tx) => {
    await tx`
      UPDATE visits SET
        visit_date = ${visitDate}, country = ${country}, state = ${state},
        city = ${city}, notes = ${notes},
        latitude = ${coords?.lat ?? null}, longitude = ${coords?.lng ?? null},
        updated_at = now()
      WHERE id = ${id}
    `;

    // Replace members
    await tx`DELETE FROM visit_members WHERE visit_id = ${id}`;
    const membersJson = formData.get("members") as string;
    if (membersJson) {
      const memberIds = JSON.parse(membersJson) as string[];
      if (memberIds.length > 0) {
        await tx`
          INSERT INTO visit_members ${tx(
            memberIds.map(mid => ({ visit_id: id, family_member_id: mid }))
          )}
        `;
      }
    }
  });

  revalidatePath("/visits");
  redirect("/visits");
}

export async function deleteVisit(id: string) {
  const userId = await getUserId();
  await sql`DELETE FROM visits WHERE id = ${id} AND user_id = ${userId}`;
  revalidatePath("/visits");
  redirect("/visits");
}

export async function bulkDeleteVisits(ids: string[]) {
  const userId = await getUserId();
  if (ids.length === 0) return;
  await sql`DELETE FROM visits WHERE id = ANY(${ids}) AND user_id = ${userId}`;
  revalidatePath("/visits");
  revalidatePath("/family");
}
