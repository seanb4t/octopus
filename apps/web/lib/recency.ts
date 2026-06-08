// Pure recency/staleness utilities shared by indexing, repo analysis, and
// review-context assembly. No I/O — fully unit-testable without mocks.

/**
 * A doc chunk is "stale" when its last commit is more than ~6 months older
 * than the median last-commit date of the repo's code files. An absolute gap
 * is used instead of a relative one (e.g. 2x median age) because relative
 * thresholds misfire on young repos.
 */
export const STALE_DOC_GAP_MS = 183 * 24 * 60 * 60 * 1000;

const DOC_EXTENSIONS = new Set(["md", "mdx", "txt"]);

const ROOT_MANIFESTS = new Set([
  "package.json", "go.mod", "Cargo.toml", "pyproject.toml",
  "pom.xml", "build.gradle", "Gemfile", "composer.json",
]);

export type ChunkKind = "doc" | "code";

export function chunkKind(filePath: string): ChunkKind {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return DOC_EXTENSIONS.has(ext) ? "doc" : "code";
}

export type AnalysisChunk = {
  text: string;
  filePath: string;
  kind: ChunkKind;
  lastModifiedAt: string | null;
};

/** Median last-modified date across DISTINCT dated code files. */
export function medianCodeDate(
  chunks: { filePath: string; kind: ChunkKind; lastModifiedAt: string | null }[],
): string | null {
  const byFile = new Map<string, string>();
  for (const c of chunks) {
    if (c.kind === "code" && c.lastModifiedAt) byFile.set(c.filePath, c.lastModifiedAt);
  }
  const dates = [...byFile.values()].sort();
  return dates.length > 0 ? dates[Math.floor(dates.length / 2)] : null;
}

export function isStaleDoc(
  kind: ChunkKind,
  lastModifiedAt: string | null,
  median: string | null,
): boolean {
  if (kind !== "doc" || !lastModifiedAt || !median) return false;
  return Date.parse(median) - Date.parse(lastModifiedAt) > STALE_DOC_GAP_MS;
}

/**
 * " (last modified 2024-08-12 — 14 months older than typical code in this repo)"
 * Empty string when the date is unknown; relative phrase only for stale docs.
 */
export function formatAgeAnnotation(
  lastModifiedAt: string | null,
  median: string | null,
  kind: ChunkKind,
): string {
  if (!lastModifiedAt) return "";
  const date = lastModifiedAt.slice(0, 10);
  if (isStaleDoc(kind, lastModifiedAt, median)) {
    const months = Math.round(
      (Date.parse(median as string) - Date.parse(lastModifiedAt)) / (30 * 24 * 60 * 60 * 1000),
    );
    return ` (last modified ${date} — ${months} months older than typical code in this repo)`;
  }
  return ` (last modified ${date})`;
}

/**
 * Structured selection over a repo's full chunk-payload set:
 * - root README* + root manifest chunks are always seeded;
 * - docs are capped at ~20% of the budget;
 * - round-robin across top-level directories, max 3 chunks per file;
 * - newest lastModifiedAt first within each bucket, undated last;
 * - tiny repos: a final top-up pass returns everything available.
 */
export function selectFromPayloads(
  all: AnalysisChunk[],
  limit: number,
): { chunks: AnalysisChunk[]; medianCode: string | null } {
  const medianCode = medianCodeDate(all);

  const newestFirst = (a: AnalysisChunk, b: AnalysisChunk) => {
    if (a.lastModifiedAt && b.lastModifiedAt) return b.lastModifiedAt.localeCompare(a.lastModifiedAt);
    if (a.lastModifiedAt) return -1;
    if (b.lastModifiedAt) return 1;
    return 0;
  };

  const seeds: AnalysisChunk[] = [];
  const docs: AnalysisChunk[] = [];
  const code: AnalysisChunk[] = [];
  for (const c of all) {
    const basename = c.filePath.split("/").pop() ?? "";
    const isRoot = !c.filePath.includes("/");
    if (isRoot && (basename.toLowerCase().startsWith("readme") || ROOT_MANIFESTS.has(basename))) {
      seeds.push(c);
    } else if (c.kind === "doc") {
      docs.push(c);
    } else {
      code.push(c);
    }
  }
  docs.sort(newestFirst);
  code.sort(newestFirst);

  const perFile = new Map<string, number>();
  const selected: AnalysisChunk[] = [];
  const selectedSet = new Set<AnalysisChunk>();

  // Round-robin across top-level directories, max 3 chunks per file.
  const take = (pool: AnalysisChunk[], n: number): void => {
    if (n <= 0) return;
    const byDir = new Map<string, AnalysisChunk[]>();
    for (const c of pool) {
      if (selectedSet.has(c)) continue; // skip already-selected chunks
      const dir = c.filePath.includes("/") ? c.filePath.split("/")[0] : ".";
      const arr = byDir.get(dir) ?? [];
      arr.push(c);
      byDir.set(dir, arr);
    }
    let taken = 0;
    let progressed = true;
    while (taken < n && progressed) {
      progressed = false;
      for (const arr of byDir.values()) {
        if (taken >= n) break;
        while (arr.length > 0) {
          const c = arr.shift() as AnalysisChunk;
          if ((perFile.get(c.filePath) ?? 0) >= 3) continue;
          perFile.set(c.filePath, (perFile.get(c.filePath) ?? 0) + 1);
          selected.push(c);
          selectedSet.add(c);
          taken++;
          progressed = true;
          break;
        }
      }
    }
  };

  take(seeds, seeds.length); // per-file cap bounds this to a handful of chunks
  take(docs, Math.min(Math.floor(limit * 0.2), limit - selected.length));
  take(code, limit - selected.length);
  take(docs, limit - selected.length); // tiny-repo top-up: spare code budget -> docs

  return { chunks: selected, medianCode };
}
