import { mock } from "bun:test";
import assert from "node:assert/strict";

// The GitHub module is server-only and pulls in the database client, so this
// runs in a child process with those two mocked. No service is contacted.
mock.module("server-only", () => ({}));
mock.module("@octopus/db", () => ({ prisma: {} }));

const { mapPullRequestReviews } = await import("@/lib/github");

const mapped = mapPullRequestReviews([
  { id: 1, body: "## Octopus Review", user: { login: "octopus-fzymgc[bot]" }, submitted_at: "2026-10-01T00:00:00Z" },
  { id: 2, body: "an old review", user: null, submitted_at: "2026-09-01T00:00:00Z" },
]);
assert.deepEqual(mapped, [
  { id: 1, body: "## Octopus Review", user: "octopus-fzymgc[bot]", submittedAt: "2026-10-01T00:00:00Z" },
  { id: 2, body: "an old review", user: "", submittedAt: "2026-09-01T00:00:00Z" },
]);
console.log("PASS a review with no author maps to an empty login");
