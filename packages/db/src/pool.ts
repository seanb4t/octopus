import { PrismaPg } from "@prisma/adapter-pg";

/**
 * The Prisma adapter with a log line for the errors its connection pool emits,
 * such as a connection that Postgres closed while idle. The adapter listens on
 * the pool, so the process keeps serving; without the callback such an error
 * is visible only under DEBUG. The pool drops that client and opens a new one
 * on the next query.
 */
export function createAdapter(connectionString: string | undefined, max?: number): PrismaPg {
  return new PrismaPg(
    { connectionString, ...(max === undefined ? {} : { max }) },
    { onPoolError: (err) => console.error("[db] pool error:", err.message) },
  );
}
