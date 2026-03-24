import { NextRequest, NextResponse } from "next/server";
import sql from "@/lib/db";
import { getUserId } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const field = searchParams.get("field");
  const country = searchParams.get("country");
  const state = searchParams.get("state");

  if (!field || !["country", "state", "city"].includes(field)) {
    return NextResponse.json([]);
  }

  const userId = await getUserId();

  let results: { value: string }[];

  if (field === "country") {
    results = await sql`
      SELECT DISTINCT country AS value FROM visits
      WHERE user_id = ${userId} AND country IS NOT NULL
      ORDER BY value LIMIT 500
    `;
  } else if (field === "state") {
    results = country
      ? await sql`
          SELECT DISTINCT state AS value FROM visits
          WHERE user_id = ${userId} AND state IS NOT NULL AND country = ${country}
          ORDER BY value LIMIT 500
        `
      : await sql`
          SELECT DISTINCT state AS value FROM visits
          WHERE user_id = ${userId} AND state IS NOT NULL
          ORDER BY value LIMIT 500
        `;
  } else {
    // city
    if (country && state) {
      results = await sql`
        SELECT DISTINCT city AS value FROM visits
        WHERE user_id = ${userId} AND city IS NOT NULL AND country = ${country} AND state = ${state}
        ORDER BY value LIMIT 500
      `;
    } else if (country) {
      results = await sql`
        SELECT DISTINCT city AS value FROM visits
        WHERE user_id = ${userId} AND city IS NOT NULL AND country = ${country}
        ORDER BY value LIMIT 500
      `;
    } else {
      results = await sql`
        SELECT DISTINCT city AS value FROM visits
        WHERE user_id = ${userId} AND city IS NOT NULL
        ORDER BY value LIMIT 500
      `;
    }
  }

  const unique = results.map((r) => r.value).filter(Boolean);
  return NextResponse.json(unique);
}
