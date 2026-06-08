import { describe, it, expect } from "bun:test";
import {
  chunkKind,
  medianCodeDate,
  isStaleDoc,
  formatAgeAnnotation,
  selectFromPayloads,
  STALE_DOC_GAP_MS,
  type AnalysisChunk,
} from "@/lib/recency";

const chunk = (filePath: string, lastModifiedAt: string | null = null, text = "x"): AnalysisChunk => ({
  text,
  filePath,
  kind: chunkKind(filePath),
  lastModifiedAt,
});

describe("chunkKind", () => {
  it("classifies md/mdx/txt as doc, everything else as code", () => {
    expect(chunkKind("docs/design.md")).toBe("doc");
    expect(chunkKind("README.mdx")).toBe("doc");
    expect(chunkKind("notes.txt")).toBe("doc");
    expect(chunkKind("src/app.ts")).toBe("code");
    expect(chunkKind("config.yaml")).toBe("code");
  });
});

describe("medianCodeDate", () => {
  it("uses distinct dated CODE files only", () => {
    const median = medianCodeDate([
      chunk("a.ts", "2026-01-01T00:00:00Z"),
      chunk("a.ts", "2026-01-01T00:00:00Z"), // duplicate file — counted once
      chunk("b.ts", "2026-03-01T00:00:00Z"),
      chunk("c.ts", "2026-05-01T00:00:00Z"),
      chunk("old.md", "2020-01-01T00:00:00Z"), // doc — ignored
      chunk("undated.ts", null), // undated — ignored
    ]);
    expect(median).toBe("2026-03-01T00:00:00Z");
  });

  it("returns null when no code file is dated", () => {
    expect(medianCodeDate([chunk("a.md", "2026-01-01T00:00:00Z"), chunk("b.ts", null)])).toBeNull();
  });
});

describe("isStaleDoc", () => {
  const median = "2026-06-01T00:00:00Z";
  it("flags docs more than ~6 months older than the median code date", () => {
    expect(isStaleDoc("doc", "2025-06-01T00:00:00Z", median)).toBe(true);
    expect(isStaleDoc("doc", "2026-05-01T00:00:00Z", median)).toBe(false);
    expect(isStaleDoc("code", "2025-06-01T00:00:00Z", median)).toBe(false);
    expect(isStaleDoc("doc", null, median)).toBe(false);
    expect(isStaleDoc("doc", "2025-06-01T00:00:00Z", null)).toBe(false);
  });
});

describe("formatAgeAnnotation", () => {
  it("formats plain dates and stale-doc relative phrasing", () => {
    expect(formatAgeAnnotation("2026-05-28T10:00:00Z", null, "code")).toBe(" (last modified 2026-05-28)");
    expect(formatAgeAnnotation(null, "2026-06-01T00:00:00Z", "doc")).toBe("");
    const stale = formatAgeAnnotation("2024-08-12T00:00:00Z", "2026-06-01T00:00:00Z", "doc");
    expect(stale).toContain("last modified 2024-08-12");
    expect(stale).toContain("older than typical code in this repo");
  });
});

describe("selectFromPayloads", () => {
  it("caps docs at ~20% of the budget", () => {
    const all = [
      ...Array.from({ length: 30 }, (_, i) => chunk(`docs/d${i}.md`, "2026-01-01T00:00:00Z")),
      ...Array.from({ length: 30 }, (_, i) => chunk(`src/f${i}.ts`, "2026-01-01T00:00:00Z")),
    ];
    const { chunks } = selectFromPayloads(all, 20);
    expect(chunks.length).toBe(20);
    expect(chunks.filter((c) => c.kind === "doc").length).toBeLessThanOrEqual(4);
  });

  it("always seeds root README and root manifest", () => {
    const all = [
      chunk("README.md", "2020-01-01T00:00:00Z"),
      chunk("package.json", "2020-01-01T00:00:00Z"),
      ...Array.from({ length: 50 }, (_, i) => chunk(`src/f${i}.ts`, "2026-01-01T00:00:00Z")),
    ];
    const { chunks } = selectFromPayloads(all, 10);
    const paths = chunks.map((c) => c.filePath);
    expect(paths).toContain("README.md");
    expect(paths).toContain("package.json");
  });

  it("caps any single file at 3 chunks and round-robins top-level dirs", () => {
    const all = [
      ...Array.from({ length: 10 }, () => chunk("src/huge.ts", "2026-01-01T00:00:00Z")),
      ...Array.from({ length: 10 }, (_, i) => chunk(`lib/l${i}.ts`, "2026-01-01T00:00:00Z")),
    ];
    const { chunks } = selectFromPayloads(all, 12);
    expect(chunks.filter((c) => c.filePath === "src/huge.ts").length).toBeLessThanOrEqual(3);
    expect(chunks.some((c) => c.filePath.startsWith("lib/"))).toBe(true);
  });

  it("prefers newer files; undated sort last", () => {
    const all = [
      chunk("src/old.ts", "2020-01-01T00:00:00Z"),
      chunk("src/new.ts", "2026-01-01T00:00:00Z"),
      chunk("src/undated.ts", null),
    ];
    const { chunks } = selectFromPayloads(all, 2);
    const paths = chunks.map((c) => c.filePath);
    expect(paths[0]).toBe("src/new.ts");
    expect(paths).not.toContain("src/undated.ts");
  });

  it("returns everything for tiny repos (top-up across kinds)", () => {
    const all = [chunk("README.md"), chunk("docs/a.md"), chunk("docs/b.md"), chunk("src/x.ts")];
    const { chunks } = selectFromPayloads(all, 80);
    expect(chunks.length).toBe(4);
  });

  it("computes the median code date alongside", () => {
    const { medianCode } = selectFromPayloads(
      [chunk("a.ts", "2026-01-01T00:00:00Z"), chunk("b.ts", "2026-03-01T00:00:00Z"), chunk("c.ts", "2026-05-01T00:00:00Z")],
      80,
    );
    expect(medianCode).toBe("2026-03-01T00:00:00Z");
  });
});

describe("STALE_DOC_GAP_MS", () => {
  it("is approximately six months", () => {
    expect(STALE_DOC_GAP_MS).toBe(183 * 24 * 60 * 60 * 1000);
  });
});
