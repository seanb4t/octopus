import { expect, it } from "bun:test";

// The harness mocks @/lib/qdrant and @/lib/embeddings with mock.module, which
// lasts for the whole process, so it runs in its own process.
it("dates indexed files from the git history", async () => {
  const child = Bun.spawn(["bun", "test", "./lib/__tests__/fixtures/file-recency-harness.ts"], {
    cwd: import.meta.dir + "/../..", stdout: "pipe", stderr: "pipe",
  });
  const [exit, stderr] = await Promise.all([child.exited, new Response(child.stderr).text(), new Response(child.stdout).text()]);
  expect({ exit, errors: exit ? stderr : "" }).toEqual({ exit: 0, errors: "" });
}, 60_000);
