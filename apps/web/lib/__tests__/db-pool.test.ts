import { describe, expect, it } from "bun:test";
import { createAdapter } from "@octopus/db/pool";

describe("database pool errors", () => {
  it("logs a pool error instead of raising an uncaught exception", async () => {
    const errors: unknown[][] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => { errors.push(args); };
    let uncaught = 0;
    const onUncaught = () => { uncaught++; };
    process.on("uncaughtException", onUncaught);
    // The adapter as packages/db builds it. No connection is opened: pg connects on the first query only.
    const adapter = await createAdapter("postgres://user:pass@127.0.0.1:1/db").connect();
    try {
      adapter.underlyingDriver().emit("error", new Error("terminating connection due to administrator command"));
      await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
      console.error = originalError;
      process.off("uncaughtException", onUncaught);
      await adapter.dispose();
    }
    expect(uncaught).toBe(0);
    expect(errors).toEqual([["[db] pool error:", "terminating connection due to administrator command"]]);
  });
});
