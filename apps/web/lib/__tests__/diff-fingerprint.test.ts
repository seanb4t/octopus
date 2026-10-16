import { describe, expect, it } from "bun:test";
import { diffFingerprint, findingsSummarySection } from "@/lib/review-coverage";

const file = (hunk: string, index = "index 1111111..2222222 100644") =>
  `diff --git a/src/a.ts b/src/a.ts\n${index}\n--- a/src/a.ts\n+++ b/src/a.ts\n${hunk}`;
const change = (start: number) => `@@ -${start},3 +${start},3 @@ function a() {\n context\n-old line\n+new line\n context\n`;

describe("diffFingerprint", () => {
  it("is the same when a hunk moves and the blob id changes", () => {
    const before = diffFingerprint(file(change(10)));
    const after = diffFingerprint(file(change(20), "index 3333333..4444444 100644"));
    expect(after).toBe(before);
  });

  it("differs when one line is added", () => {
    const before = diffFingerprint(file(change(10)));
    const after = diffFingerprint(file(`@@ -10,3 +10,4 @@ function a() {\n context\n-old line\n+new line\n+one more line\n context\n`));
    expect(after).not.toBe(before);
  });

  it("differs when a line changes", () => {
    const before = diffFingerprint(file(change(10)));
    const after = diffFingerprint(file(change(10).replace("+new line", "+new line // changed")));
    expect(after).not.toBe(before);
  });

  it("is independent of file order", () => {
    const a = `diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n@@ -1 +1 @@\n-x\n+y\n`;
    const b = `diff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1 +1 @@\n-p\n+q\n`;
    expect(diffFingerprint(a + b)).toBe(diffFingerprint(b + a));
    expect(diffFingerprint(a)).not.toBe(diffFingerprint(b));
  });

  it("counts a content line that starts with the file-header markers", () => {
    // A content line `++ x` appears as `+++ x` in the diff, and a removed `-- x` as `--- x`.
    const before = diffFingerprint(file(change(10)));
    const plusPlus = diffFingerprint(file(`@@ -10,3 +10,4 @@ function a() {\n context\n-old line\n+new line\n+++ x\n context\n`));
    const minusMinus = diffFingerprint(file(`@@ -10,4 +10,3 @@ function a() {\n context\n-old line\n--- x\n+new line\n context\n`));
    expect(plusPlus).not.toBe(before);
    expect(minusMinus).not.toBe(before);
    expect(plusPlus).not.toBe(minusMinus);
  });

  it("counts the blob ids of a binary change", () => {
    const binary = (index: string) => `diff --git a/logo.png b/logo.png\n${index}\nBinary files a/logo.png and b/logo.png differ\n`;
    expect(diffFingerprint(binary("index 1111111..2222222 100644"))).not.toBe(diffFingerprint(binary("index 1111111..3333333 100644")));
    expect(diffFingerprint(binary("index 1111111..2222222 100644"))).toBe(diffFingerprint(binary("index 1111111..2222222 100644")));
  });

  it("includes hunk headers in the proof that it ignores them", () => {
    // The raw text differs between the two diffs, so a hash of the raw text would differ.
    const raw = (s: number) => file(change(s));
    expect(raw(10)).not.toBe(raw(20));
    expect(diffFingerprint(raw(10))).toBe(diffFingerprint(raw(20)));
  });
});

describe("findingsSummarySection", () => {
  it("returns the section up to the next heading", () => {
    const body = "### Score\n| a |\n\n### Findings Summary\n| Severity | Count |\n| --- | --- |\n| 🟠 High | 1 |\n\n### Findings\n<!-- OCTOPUS_FINDINGS_START -->\n[]\n<!-- OCTOPUS_FINDINGS_END -->";
    expect(findingsSummarySection(body)).toBe("### Findings Summary\n| Severity | Count |\n| --- | --- |\n| 🟠 High | 1 |");
    expect(findingsSummarySection("no table here")).toBe("");
  });
});
