import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const field = searchParams.get("field"); // "country" | "state" | "city"
  const country = searchParams.get("country");
  const state = searchParams.get("state");

  if (!field || !["country", "state", "city"].includes(field)) {
    return NextResponse.json([]);
  }

  const supabase = await createClient();

  let query = supabase.from("visits").select(field);

  // Filter by parent fields for cascading
  if (field === "state" && country) {
    query = query.eq("country", country);
  }
  if (field === "city") {
    if (country) query = query.eq("country", country);
    if (state) query = query.eq("state", state);
  }

  // Get non-null values (limited to prevent unbounded queries)
  query = query.not(field, "is", null).order(field).limit(500);

  const { data, error } = await query;
  if (error) return NextResponse.json([]);

  // Deduplicate (Supabase doesn't have DISTINCT on single column easily)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const unique = [...new Set(data.map((row: any) => row[field] as string))].filter(Boolean);

  return NextResponse.json(unique);
}
