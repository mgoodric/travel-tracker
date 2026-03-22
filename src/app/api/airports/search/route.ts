import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("airports")
    .select("id, ident, iata_code, name, latitude, longitude, elevation_ft, type, municipality, iso_country, iso_region")
    .or(`search_text.ilike.%${q}%,ident.eq.${q.toUpperCase()}`)
    .order("type", { ascending: true })
    .limit(10);

  if (error) {
    console.error("Airport search error:", error.message);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }

  return NextResponse.json(data);
}
