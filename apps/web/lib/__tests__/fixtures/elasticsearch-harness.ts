import assert from "node:assert/strict";

// The sync-log module reads ELASTICSEARCH_URL at import time, so this runs in
// a child process with the variable removed before the import. No service is
// contacted. The configured path is not exercised here: the Elasticsearch
// client uses an Undici connection that Bun does not serve in a test process.
delete process.env.ELASTICSEARCH_URL;

const errors: unknown[][] = [];
console.error = (...args: unknown[]) => { errors.push(args); };

const { writeSyncLog, getSyncLogs, deleteSyncLogs } = await import("@/lib/elasticsearch");
await writeSyncLog({ orgId: "org", repoId: "repo", message: "indexed", level: "info", timestamp: 1_700_000_000_000 });
assert.deepEqual(await getSyncLogs("org", "repo"), []);
await deleteSyncLogs("org", "repo");
assert.deepEqual(errors, []);
console.log("PASS sync log with no store writes nothing and logs nothing");
