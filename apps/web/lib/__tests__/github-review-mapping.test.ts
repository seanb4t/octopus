import { describe, expect, it } from "bun:test";

describe("mapPullRequestReviews", () => {
  it("maps a review with no author to an empty login", async () => {
    const child = Bun.spawn(["bun", "lib/__tests__/fixtures/github-review-mapping-harness.ts"], {
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
    expect(stdout).toContain("PASS a review with no author maps to an empty login");
  });
});
