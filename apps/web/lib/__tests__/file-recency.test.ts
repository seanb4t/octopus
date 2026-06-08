import { describe, it, expect, mock, beforeEach } from "bun:test";
import { collectFileRecency } from "@/lib/indexer";
import { mkdtemp, rm as rmDir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

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

describe("collectFileRecency", () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "recency-fixture-"));
    const git = (args: string[], date?: string) =>
      run("git", ["-C", repoDir, ...args], {
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t",
          GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
          ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
        },
      });
    await run("git", ["init", "-b", "main", repoDir]);
    // file:// partial clones need allowFilter on the source
    await git(["config", "uploadpack.allowFilter", "true"]);
    await mkdir(join(repoDir, "docs"), { recursive: true });
    await writeFile(join(repoDir, "docs/design.md"), "old doc\n");
    await git(["add", "."], undefined);
    await git(["commit", "-m", "old"], "2024-01-01T00:00:00Z");
    await writeFile(join(repoDir, "main.ts"), "new code\n");
    await git(["add", "."], undefined);
    await git(["commit", "-m", "new"], "2026-06-01T00:00:00Z");
  });

  it("dates each file by its last commit", async () => {
    const map = await collectFileRecency(`file://${repoDir}`, undefined, "main", () => {});
    expect(map.get("main.ts")?.startsWith("2026-06-01")).toBe(true);
    expect(map.get("docs/design.md")?.startsWith("2024-01-01")).toBe(true);
    await rmDir(repoDir, { recursive: true, force: true });
  });

  it("returns an empty map on clone failure instead of throwing", async () => {
    const map = await collectFileRecency("file:///nonexistent-repo", undefined, "main", () => {});
    expect(map.size).toBe(0);
    await rmDir(repoDir, { recursive: true, force: true });
  });
});
