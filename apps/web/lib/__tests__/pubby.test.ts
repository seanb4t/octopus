import { describe, expect, it } from "bun:test";

async function runHarness(mode: "unset" | "set") {
  const child = Bun.spawn(["bun", "lib/__tests__/fixtures/pubby-harness.ts", mode], {
    cwd: import.meta.dir + "/../..",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exit, stdout, stderr };
}

describe("pubby client", () => {
  it("is a no-op with no credentials", async () => {
    const result = await runHarness("unset");
    expect({ exit: result.exit, stderr: result.stderr }).toEqual({ exit: 0, stderr: "" });
    expect(result.stdout).toContain("PASS pubby trigger with no credentials sends nothing and logs nothing");
  });

  it("is the real client with credentials", async () => {
    const result = await runHarness("set");
    expect({ exit: result.exit, stderr: result.stderr }).toEqual({ exit: 0, stderr: "" });
    expect(result.stdout).toContain("PASS pubby trigger with credentials sends the event");
  });
});
