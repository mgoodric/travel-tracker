import type postgres from "postgres";
import { getUserId } from "./auth.js";

let cache: Map<string, string> | null = null;

/** Load family members as a Map<lowercase_name, id>. Cached after first call. */
export async function getFamilyMembers(
  sql: postgres.Sql
): Promise<Map<string, string>> {
  if (cache) return cache;

  const userId = getUserId();
  const members = await sql`
    SELECT id, name FROM family_members WHERE user_id = ${userId}
  `;

  cache = new Map<string, string>();
  for (const m of members) {
    cache.set(m.name.toLowerCase(), m.id);
  }
  return cache;
}
