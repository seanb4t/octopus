import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

it("checks synthetic legacy compatibility and tenant-scoped log ordering", async () => {
  const child = Bun.spawn([process.execPath, fileURLToPath(new URL("./fixtures/elasticsearch-harness.ts", import.meta.url))], { cwd: process.cwd(), stdout: "pipe", stderr: "pipe" });
  const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect(exit, `${stdout}\n${stderr}`).toBe(0);
});

it("is a no-op with no ELASTICSEARCH_URL", async () => {
  const child = Bun.spawn(["bun", "lib/__tests__/fixtures/elasticsearch-unset-harness.ts"], { cwd: import.meta.dir + "/../..", stdout: "pipe", stderr: "pipe" });
  const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect({ exit, stderr }).toEqual({ exit: 0, stderr: "" });
  expect(stdout).toContain("PASS sync log with no store writes nothing and logs nothing");
});
