import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");

  if (!q || q.length < 2) {
    return NextResponse.json([]);
  }

  const data = await sql`
    SELECT id, ident, iata_code, name, latitude, longitude, elevation_ft, type, municipality, iso_country, iso_region
    FROM airports
    WHERE search_text ILIKE ${"%" + q + "%"} OR ident = ${q.toUpperCase()}
    ORDER BY type ASC
    LIMIT 10
  `;

  return NextResponse.json(data);
}
