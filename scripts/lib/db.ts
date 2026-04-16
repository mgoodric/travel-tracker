import postgres from "postgres";

if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL environment variable");
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL, {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
});

export default sql;

export async function closeDb() {
  await sql.end();
}
