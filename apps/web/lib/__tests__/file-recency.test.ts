import { describe, it, expect, mock, beforeEach } from "bun:test";

// ── Mock external dependencies before importing ──

let mockDeleteRepoFileChunks = mock(() => Promise.resolve());
let mockEnsureCollection = mock(() => Promise.resolve());
let mockUpsertChunks = mock(() => Promise.resolve());
let mockDeleteRepoChunks = mock(() => Promise.resolve());

mock.module("@/lib/qdrant", () => ({
  deleteRepoFileChunks: (...args: unknown[]) => mockDeleteRepoFileChunks(...args),
  ensureCollection: () => mockEnsureCollection(),
  upsertChunks: (...args: unknown[]) => mockUpsertChunks(...args),
  deleteRepoChunks: (...args: unknown[]) => mockDeleteRepoChunks(...args),
}));

mock.module("@/lib/embeddings", () => ({
  createEmbeddings: (texts: string[]) =>
    Promise.resolve(texts.map(() => new Array(3072).fill(0.1))),
}));

mock.module("@/lib/sparse-vector", () => ({
  generateSparseVectors: (texts: string[]) =>
    texts.map(() => ({ indices: [0, 1], values: [0.5, 0.5] })),
}));

mock.module("@/lib/github", () => ({
  getInstallationToken: () => Promise.resolve("test-token"),
  getFileContent: () => Promise.resolve(null),
}));

mock.module("@/lib/bitbucket", () => ({
  getFileContent: () => Promise.resolve(null),
  getAccessToken: () => Promise.resolve("bb-token"),
}));

mock.module("@/lib/octopus-ignore", () => ({
  parseOctopusIgnore: () => ({ ignores: () => false }),
}));

import { parseGitLogNameStatus } from "@/lib/indexer";

describe("parseGitLogNameStatus", () => {
  it("maps each path to its newest commit date (log is newest-first)", () => {
    const log = [
      "COMMIT:2026-06-01T10:00:00+00:00",
      "M\tsrc/a.ts",
      "A\tdocs/design.md",
      "",
      "COMMIT:2026-01-15T10:00:00+00:00",
      "M\tsrc/a.ts",
      "A\tsrc/b.ts",
    ].join("\n");
    const map = parseGitLogNameStatus(log);
    expect(map.get("src/a.ts")).toBe("2026-06-01T10:00:00+00:00");
    expect(map.get("docs/design.md")).toBe("2026-06-01T10:00:00+00:00");
    expect(map.get("src/b.ts")).toBe("2026-01-15T10:00:00+00:00");
  });

  it("records the NEW path for renames and copies", () => {
    const log = [
      "COMMIT:2026-03-01T00:00:00+00:00",
      "R100\told/name.ts\tnew/name.ts",
      "C75\tsrc/base.ts\tsrc/copy.ts",
    ].join("\n");
    const map = parseGitLogNameStatus(log);
    expect(map.get("new/name.ts")).toBe("2026-03-01T00:00:00+00:00");
    expect(map.get("src/copy.ts")).toBe("2026-03-01T00:00:00+00:00");
    expect(map.has("old/name.ts")).toBe(false);
  });

  it("tolerates merge commits (no file lines) and blank lines", () => {
    const log = [
      "COMMIT:2026-04-01T00:00:00+00:00",
      "",
      "COMMIT:2026-03-01T00:00:00+00:00",
      "M\tsrc/a.ts",
    ].join("\n");
    expect(parseGitLogNameStatus(log).get("src/a.ts")).toBe("2026-03-01T00:00:00+00:00");
  });

  it("returns an empty map for empty input", () => {
    expect(parseGitLogNameStatus("").size).toBe(0);
  });
});
