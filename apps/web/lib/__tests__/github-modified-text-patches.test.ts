import { describe, expect, it } from "bun:test";
import { fetchGitHubReviewInput } from "@/lib/github-review-input";
import { prepareReviewInput } from "@/lib/review-coverage";

const head = "1".repeat(40), base = "2".repeat(40);
const blob = "5b0535786022ecb2c66abe99982594b4c4aa6b53";
const path = "openspec/changes/example/review.md";

// Two hunks with three lines of context, as GitHub's raw diff renders them:
// one line inserted after line 3, then old line 23 removed.
const line = (n: number) => `line ${n}`;
const hunk1 = "@@ -1,6 +1,7 @@ # Review\n" + [1, 2, 3].map(n => ` ${line(n)}\n`).join("") + "+inserted\n" + [4, 5, 6].map(n => ` ${line(n)}\n`).join("");
const hunk2 = "@@ -20,7 +21,6 @@\n" + [20, 21, 22].map(n => ` ${line(n)}\n`).join("") + `-${line(23)}\n` + [24, 25, 26].map(n => ` ${line(n)}\n`).join("");
const patch = hunk1 + hunk2;
const header = (p = path, index = `index c78bf198..${blob.slice(0, 8)} 100644`) => `diff --git a/${p} b/${p}\n${index}\n--- a/${p}\n+++ b/${p}\n`;
const diff = header() + patch;
const file = { filename: path, status: "modified", additions: 1, deletions: 1, sha: blob };

async function fetch(files: unknown[], raw: string, maxPatchChars = 200_000) {
  return (await fetchGitHubReviewInput({ expectedHead: head, maxPatchChars,
    fetchDiff: async () => raw,
    readJson: async suffix => suffix ? files : { head: { sha: head }, base: { sha: base }, changed_files: files.length },
  })).input;
}

describe("GitHub missing modified text patches", () => {
  it("recovers an edited file whose patch the files API left out", async () => {
    const input = await fetch([file], diff);
    expect(input.files[0].patch).toBe(patch);
    expect(input.files[0].unavailable).toBeUndefined();
    const prepared = prepareReviewInput(input, { maxChars: 10_000 });
    expect(prepared.coverage.complete).toBe(true);
    expect(prepared.coverage.files[0]).toMatchObject({ state: "supplied", blobSha: blob });
    expect(prepared.diff).toContain(hunk2);
  });

  it("recovers the file among others whose patches GitHub did return", async () => {
    const other = { filename: "src/a.ts", status: "modified", additions: 1, deletions: 0, sha: "3".repeat(40), patch: "@@ -1,0 +2,1 @@\n+x\n" };
    const input = await fetch([other, file], header("src/a.ts", "index 1111111..3333333 100644") + other.patch + diff);
    expect(input.files.map(f => f.patch)).toEqual([other.patch, patch]);
    expect(prepareReviewInput(input, { maxChars: 10_000 }).coverage.complete).toBe(true);
  });

  it("accepts an executable file whose mode did not change", async () => {
    const input = await fetch([file], header(path, `index c78bf198..${blob.slice(0, 8)} 100755`) + patch);
    expect(input.files[0].patch).toBe(patch);
  });

  it("accepts zero-context insertion and deletion ranges", async () => {
    const zero = "@@ -3,0 +4 @@\n+inserted\n@@ -23 +23,0 @@\n-gone\n";
    const input = await fetch([file], header() + zero);
    expect(input.files[0].patch).toBe(zero);
  });

  it("accepts a file that grew from empty", async () => {
    const grown = "@@ -0,0 +1,2 @@\n+a\n+b\n";
    const input = await fetch([{ ...file, additions: 2, deletions: 0 }], header() + grown);
    expect(input.files[0].patch).toBe(grown);
  });

  const metadata: [string, Record<string, unknown>][] = [
    ["missing blob", { sha: undefined }], ["short blob", { sha: blob.slice(0, 8) }],
    ["other blob", { sha: "a".repeat(40) }], ["null blob", { sha: "0".repeat(40) }],
    ["more additions", { additions: 2 }], ["fewer deletions", { deletions: 0 }],
    ["missing counts", { additions: undefined }], ["noninteger count", { deletions: 1.5 }],
    ["renamed", { status: "renamed", previous_filename: "old.md" }], ["previous path", { previous_filename: "old.md" }],
    ["removed", { status: "removed" }], ["changed", { status: "changed" }],
    ["null patch", { patch: null }],
  ];
  for (const [label, change] of metadata) {
    it(`does not replace absent or contradictory evidence: ${label}`, async () => {
      const input = await fetch([{ ...file, ...change }], diff);
      expect(prepareReviewInput(input, { maxChars: 10_000 }).coverage.files[0].state).toBe("unavailable");
    });
  }

  const invalid: [string, string][] = [
    ["missing diff", ""],
    ["another file's section", header("other.md") + patch],
    ["wrong new blob", diff.replace(`..${blob.slice(0, 8)}`, "..aaaaaaaa")],
    ["short blob prefix", diff.replace(`..${blob.slice(0, 8)}`, `..${blob.slice(0, 6)}`)],
    ["zero old blob", diff.replace("c78bf198..", "00000000..")],
    ["same old and new blob", diff.replace("c78bf198..", `${blob.slice(0, 8)}..`)],
    ["symlink", diff.replace(" 100644", " 120000")],
    ["mode change", diff.replace(/^index (.*) 100644$/m, "old mode 100644\nnew mode 100755\nindex $1")],
    ["index without mode", diff.replace(" 100644\n", "\n")],
    ["wrong old marker", diff.replace(`--- a/${path}`, "--- /dev/null")],
    ["wrong new marker", diff.replace(`+++ b/${path}`, "+++ b/other.md")],
    ["binary section", header().split("\n").slice(0, 2).join("\n") + `\nBinary files a/${path} and b/${path} differ\n`],
    ["truncated hunk", diff.replace(" line 26\n", "")],
    ["missing final newline", diff.slice(0, -1)],
    ["shifted second hunk", diff.replace("+21,6 @@", "+20,6 @@")],
    ["hunks out of order", header() + hunk2 + hunk1],
    ["overlapping hunks", header() + hunk1 + hunk1.replace("@@ -1,6 +1,7 @@", "@@ -4,6 +5,7 @@")],
    ["junk before the first hunk", header() + "garbage\n" + patch],
    ["trailing content", diff + "unexpected\n"],
    ["NUL byte", diff.replace("+inserted", "+in\0serted")],
    ["duplicate section", diff + diff],
  ];
  for (const [label, raw] of invalid) {
    it(`rejects ${label}`, async () => {
      const input = await fetch([file], raw);
      expect(input.files[0].patch).toBeUndefined();
      expect(prepareReviewInput(input, { maxChars: 10_000 }).coverage.complete).toBe(false);
    });
  }

  it("keeps a present provider patch authoritative", async () => {
    const input = await fetch([{ ...file, patch: "@@ -1 +1 @@\n-a\n+b\n" }], diff);
    expect(input.files[0].patch).toBe("@@ -1 +1 @@\n-a\n+b\n");
  });

  it("charges a recovered patch to the retained patch budget", async () => {
    const input = await fetch([file], diff, patch.length * 2 - 1);
    expect(input.files[0].patch).toBeUndefined();
    expect(input.files[0].unavailable).toBe("File exceeds retained patch budget");
  });
});
