import assert from "node:assert/strict";

// The Pubby client reads its credentials at import time, so each mode runs in
// its own child process with the environment set before the import.
// No network service is contacted: fetch is replaced before the import.
const mode = process.argv[2];
assert.ok(mode === "unset" || mode === "set", `unknown mode ${mode}`);

let fetchCalls = 0;
globalThis.fetch = (async () => {
  fetchCalls++;
  return Response.json({ success: true, channels: ["c"] });
}) as typeof fetch;

if (mode === "unset") {
  delete process.env.PUBBY_APP_ID;
  delete process.env.PUBBY_APP_KEY;
  delete process.env.PUBBY_APP_SECRET;
} else {
  process.env.PUBBY_APP_ID = "app";
  process.env.PUBBY_APP_KEY = "key";
  process.env.PUBBY_APP_SECRET = "secret";
}

const errors: unknown[][] = [];
console.error = (...args: unknown[]) => { errors.push(args); };

const { pubby, PUBBY_ENABLED } = await import("@/lib/pubby");
const { PubbyServer } = await import("@getpubby/sdk/server");

if (mode === "unset") {
  assert.equal(PUBBY_ENABLED, false);
  const result = await pubby.trigger(["presence-org-1", "landing-stats"], "review-status", { ok: true });
  assert.deepEqual(result, { success: false, channels: ["presence-org-1", "landing-stats"] });
  const single = await pubby.trigger("landing-stats", "stats:updated", {});
  assert.deepEqual(single, { success: false, channels: ["landing-stats"] });
  assert.equal(fetchCalls, 0);
  assert.deepEqual(errors, []);
  console.log("PASS pubby trigger with no credentials sends nothing and logs nothing");
} else {
  assert.equal(PUBBY_ENABLED, true);
  assert.equal(Object.getPrototypeOf(pubby), PubbyServer.prototype);
  await pubby.trigger("landing-stats", "stats:updated", {});
  assert.equal(fetchCalls, 1);
  console.log("PASS pubby trigger with credentials sends the event");
}
