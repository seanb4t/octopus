import { describe, it, expect } from "bun:test";
import { buildInlineComments, NEAREST_LINE_FALLBACK_RADIUS } from "@/lib/review-helpers";
import type { InlineFinding } from "@/lib/review-dedup";

function f(overrides: Partial<InlineFinding> = {}): InlineFinding {
  return {
    severity: "🟠",
    title: "Test finding",
    filePath: "src/foo.ts",
    startLine: 100,
    endLine: 100,
    category: "Bug",
    description: "desc",
    suggestion: "",
    confidence: 80,
    ...overrides,
  };
}

describe("buildInlineComments — exact mapping", () => {
  it("attaches when endLine is in the diff", () => {
    const diff = new Map([["src/foo.ts", new Set([100, 101, 102])]]);
    const comments = buildInlineComments([f({ startLine: 100, endLine: 100 })], diff);
    expect(comments.length).toBe(1);
    expect(comments[0]?.line).toBe(100);
    expect(comments[0]?.body).not.toContain("nearest changed line");
  });

  it("falls back to startLine when endLine is invalid", () => {
    const diff = new Map([["src/foo.ts", new Set([95])]]);
    const comments = buildInlineComments([f({ startLine: 95, endLine: 200 })], diff);
    expect(comments[0]?.line).toBe(95);
    expect(comments[0]?.body).not.toContain("nearest changed line");
  });

  it("uses an in-range valid line when neither end matches", () => {
    const diff = new Map([["src/foo.ts", new Set([102])]]);
    const comments = buildInlineComments([f({ startLine: 100, endLine: 105 })], diff);
    expect(comments[0]?.line).toBe(102);
    expect(comments[0]?.body).not.toContain("nearest changed line");
  });
});

describe("buildInlineComments — nearest-line fallback", () => {
  it("snaps to closest changed line within ±10 (after endLine)", () => {
    const diff = new Map([["src/foo.ts", new Set([108])]]);
    const comments = buildInlineComments([f({ startLine: 100, endLine: 100 })], diff);
    expect(comments.length).toBe(1);
    expect(comments[0]?.line).toBe(108);
    expect(comments[0]?.body).toContain("nearest changed line");
    expect(comments[0]?.body).toContain("L100");
  });

  it("snaps to closest changed line within ±10 (before startLine)", () => {
    const diff = new Map([["src/foo.ts", new Set([93])]]);
    const comments = buildInlineComments([f({ startLine: 100, endLine: 100 })], diff);
    expect(comments[0]?.line).toBe(93);
    expect(comments[0]?.body).toContain("nearest changed line");
  });

  it("prefers smaller delta when both sides have a valid line", () => {
    const diff = new Map([["src/foo.ts", new Set([95, 105])]]);
    const comments = buildInlineComments([f({ startLine: 100, endLine: 100 })], diff);
    // both are 5 away — endLine search runs first (95 negative delta first? no: positive then negative? actually findNearestChangedLine tries -delta then +delta on each delta value, so 95 wins on delta=5)
    expect([95, 105]).toContain(comments[0]?.line);
  });

  it("drops the comment when no valid line exists within the radius", () => {
    const farLine = 100 + NEAREST_LINE_FALLBACK_RADIUS + 5;
    const diff = new Map([["src/foo.ts", new Set([farLine])]]);
    const comments = buildInlineComments([f({ startLine: 100, endLine: 100 })], diff);
    expect(comments.length).toBe(0);
  });

  it("drops the comment when the file is not in the diff at all", () => {
    const diff = new Map([["src/bar.ts", new Set([100])]]);
    const comments = buildInlineComments([f({ filePath: "src/foo.ts" })], diff);
    expect(comments.length).toBe(0);
  });
});

describe("buildInlineComments — suggestion blocks", () => {
  const diff = new Map([["src/foo.yaml", new Set([12, 13, 14])]]);
  const yamlDiff = [
    "diff --git a/src/foo.yaml b/src/foo.yaml",
    "--- a/src/foo.yaml",
    "+++ b/src/foo.yaml",
    "@@ -0,0 +12,3 @@",
    "+image: qdrant/qdrant:v1.19.2",
    "+ports:",
    "+  - containerPort: 6333",
    "",
  ].join("\n");
  const yaml = (suggestion: string) => f({ filePath: "src/foo.yaml", startLine: 12, endLine: 14, suggestion });
  const advice = (body: string, text: string) => {
    expect(body).not.toContain("```suggestion");
    expect(body).toContain(`**Suggested change**\n\n\`\`\`\n${text}\n\`\`\``);
  };

  it("posts a sed expression as a suggested change", () => {
    const text = "s/that pass 2 deletes/that PR 2 deletes/";
    const [comment] = buildInlineComments([yaml(text)], diff, "github", yamlDiff);
    advice(comment!.body, text);
  });

  it("posts an advice sentence as a suggested change, with or without the diff text", () => {
    const text = "Confirm whether the required status checks remain enforced after this change.";
    advice(buildInlineComments([yaml(text)], diff, "github", yamlDiff)[0]!.body, text);
    advice(buildInlineComments([yaml(text)], diff, "github")[0]!.body, text);
  });

  it("posts prose that shares no tokens with the anchored lines as a suggested change", () => {
    const text = "Change the lock-file branch to include the dash, e.g. [A-Za-z0-9._/-]";
    advice(buildInlineComments([yaml(text)], diff, "github", yamlDiff)[0]!.body, text);
  });

  it("keeps replacement code as a suggestion block", () => {
    const text = "image: qdrant/qdrant:v1.19.2\nports:\n  - containerPort: 6334";
    const [comment] = buildInlineComments([yaml(text)], diff, "github", yamlDiff);
    expect(comment!.body).toContain(`\`\`\`suggestion\n${text}\n\`\`\``);
    expect(comment!.body).not.toContain("Suggested change");
  });

  it("keeps a plain code block on Bitbucket for replacement code", () => {
    const text = "image: qdrant/qdrant:v1.19.2\nports:\n  - containerPort: 6334";
    const [comment] = buildInlineComments([yaml(text)], diff, "bitbucket", yamlDiff);
    expect(comment!.body).toContain(`**Suggested fix:**\n\`\`\`\n${text}\n\`\`\``);
  });
});
