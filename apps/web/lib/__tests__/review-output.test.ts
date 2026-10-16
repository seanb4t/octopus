import { describe, expect, it } from "bun:test";

describe("review output robustness", () => {
  it("drops trailing summary prose and repairs a rejected response once", async () => {
    const child = Bun.spawn(["bun", "lib/__tests__/fixtures/review-output-harness.ts"], {
      cwd: import.meta.dir + "/../..",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [exit, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect({ exit, stderr }).toEqual({ exit: 0, stderr: "" });
    expect(stdout).toContain("PASS trailing prose after the Findings Summary table is dropped and logged");
    expect(stdout).toContain("PASS a rejected response gets one repair request");
  }, 30_000);
});
