import { describe, expect, it } from "bun:test";
import { createPool } from "@octopus/db/pool";

describe("createPool", () => {
  it("logs a pool error instead of raising an uncaught exception", async () => {
    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(args); };
    let uncaught = 0;
    const onUncaught = () => { uncaught++; };
    process.on("uncaughtException", onUncaught);
    // No connection is opened: pg connects on the first query only.
    const pool = createPool("postgres://user:pass@127.0.0.1:1/db");
    try {
      pool.emit("error", new Error("terminating connection due to administrator command"));
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      console.error = originalError;
      process.off("uncaughtException", onUncaught);
      await pool.end();
    }
    expect(uncaught).toBe(0);
    expect(errors).toEqual([["[db] pool error:", "terminating connection due to administrator command"]]);
  });
});
