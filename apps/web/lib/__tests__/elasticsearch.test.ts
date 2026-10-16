import { describe, expect, it } from "bun:test";

describe("sync log store", () => {
  it("is a no-op with no ELASTICSEARCH_URL", async () => {
    const child = Bun.spawn(["bun", "lib/__tests__/fixtures/elasticsearch-harness.ts"], {
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
    expect(stdout).toContain("PASS sync log with no store writes nothing and logs nothing");
  });
});
