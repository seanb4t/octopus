import { expect, it } from "bun:test";
it("streams OpenAI chat calls and keeps the text, completion and usage", async () => {
  const child = Bun.spawn(["bun", "lib/__tests__/fixtures/openai-stream-harness.ts"], {
    cwd: import.meta.dir + "/../..", stdout: "pipe", stderr: "pipe",
  });
  const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect({ exit, stderr }).toEqual({ exit: 0, stderr: "" });
  expect(stdout).toContain("PASS streamed text, completion and usage");
  expect(stdout).toContain("PASS streamed call with a response schema");
});
