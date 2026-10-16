import { Pool } from "pg";

/**
 * The connection pool of the Prisma adapter. The error listener keeps a
 * connection that Postgres closes while idle from raising an uncaught
 * exception in the process. The pool drops that client and opens a new one on
 * the next query.
 */
export function createPool(connectionString: string | undefined): Pool {
  const pool = new Pool({ connectionString });
  pool.on("error", (err) => console.error("[db] pool error:", err.message));
  return pool;
}
