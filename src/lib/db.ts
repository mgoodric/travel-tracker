import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export default sql;

/**
 * Helper for transactions. postgres.js TransactionSql type loses the tagged
 * template call signature through Omit, so we wrap begin() with a cast.
 */
export async function transaction<T>(
  fn: (sql: postgres.Sql) => Promise<T>
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sql.begin(fn as any) as Promise<T>;
}
