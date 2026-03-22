"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const unknownDate = formData.get("unknown_date") === "on";
  const visitDate = unknownDate ? null : (formData.get("visit_date") as string);
  const country = formData.get("country") as string;
  const state = formData.get("state") as string || null;
  const city = formData.get("city") as string || null;
  const notes = formData.get("notes") as string || null;

  const coords = await geocode(city, state, country);

  const { data: visit, error } = await supabase
    .from("visits")
    .insert({
      user_id: user.id,
      visit_date: visitDate,
      country,
      state,
      city,
      notes,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const membersJson = formData.get("members") as string;
  if (membersJson) {
    const memberIds = JSON.parse(membersJson) as string[];
    if (memberIds.length > 0) {
      const { error: mError } = await supabase.from("visit_members").insert(
        memberIds.map(id => ({ visit_id: visit.id, family_member_id: id }))
      );
      if (mError) throw new Error(mError.message);
    }
  }

  revalidatePath("/visits");
  redirect("/visits");
}

export async function updateVisit(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const unknownDate = formData.get("unknown_date") === "on";
  const visitDate = unknownDate ? null : (formData.get("visit_date") as string);
  const country = formData.get("country") as string;
  const state = formData.get("state") as string || null;
  const city = formData.get("city") as string || null;
  const notes = formData.get("notes") as string || null;

  const coords = await geocode(city, state, country);

  const { error } = await supabase
    .from("visits")
    .update({
      visit_date: visitDate,
      country,
      state,
      city,
      notes,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  // Replace members
  await supabase.from("visit_members").delete().eq("visit_id", id);
  const membersJson = formData.get("members") as string;
  if (membersJson) {
    const memberIds = JSON.parse(membersJson) as string[];
    if (memberIds.length > 0) {
      await supabase.from("visit_members").insert(
        memberIds.map(mid => ({ visit_id: id, family_member_id: mid }))
      );
    }
  }

  revalidatePath("/visits");
  redirect("/visits");
}

export async function deleteVisit(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("visits").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/visits");
  redirect("/visits");
}

export async function bulkDeleteVisits(ids: string[]) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (ids.length === 0) return;

  // Delete visit_members first, then visits
  await supabase.from("visit_members").delete().in("visit_id", ids);
  const { error } = await supabase.from("visits").delete().in("id", ids);
  if (error) throw new Error(error.message);

  revalidatePath("/visits");
  revalidatePath("/family");
}
