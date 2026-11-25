import { createHash } from "node:crypto";
import { inspectReviewPatch, type ReviewFileInput } from "@/lib/review-coverage";

const fullSha = /^[0-9a-f]{40}$/;
const countOf = (value: number | undefined) => Number.isSafeInteger(value) && value! >= 0;

/** Recover a GitHub text patch the files API omitted, from the raw diff it already fetched. */
export function recoverGitHubTextPatch(
  file: ReviewFileInput,
  revision: { headSha: string; baseSha: string },
  section: string | undefined,
): string | undefined {
  return file.change === "added" ? recoverAddedGitHubTextPatch(file, revision, section)
    : file.change === "modified" ? recoverModifiedGitHubTextPatch(file, revision, section)
    : undefined;
}

function safeSection(file: ReviewFileInput, revision: { headSha: string; baseSha: string }, section: string | undefined): section is string {
  return !!section?.endsWith("\n") && file.patch === undefined && file.unavailable === undefined
    && file.previousPath === undefined
    && !!file.blobSha && fullSha.test(file.blobSha) && !/^0+$/.test(file.blobSha)
    && [revision.headSha, revision.baseSha].every(sha => fullSha.test(sha) && !/^0+$/.test(sha))
    && file.path.length <= 4096 && /^[a-zA-Z0-9._/-]+$/.test(file.path)
    && file.path.split("/").every(part => part && part !== "." && part !== "..");
}

/**
 * Recover an in-place text edit whose patch GitHub left out of pulls/{n}/files
 * (it drops patches for large diffs). The base bytes are not fetched, so the
 * blob cannot be rebuilt; instead the section must name the file's head blob,
 * keep a regular-file mode, and carry ordered, complete hunks whose line counts
 * and coordinates agree with each other and with the files API counts.
 */
export function recoverModifiedGitHubTextPatch(
  file: ReviewFileInput,
  revision: { headSha: string; baseSha: string },
  section: string | undefined,
): string | undefined {
  if (!safeSection(file, revision, section) || file.change !== "modified"
    || !countOf(file.additions) || !countOf(file.deletions) || file.additions! + file.deletions! === 0) return;

  const lines = section.slice(0, -1).split("\n");
  if (lines[0] !== `diff --git a/${file.path} b/${file.path}`
    || lines[2] !== `--- a/${file.path}` || lines[3] !== `+++ b/${file.path}`) return;
  // Mode changes, renames and binary sections carry other header lines and fail here.
  const index = /^index ([0-9a-f]{7,40})\.\.([0-9a-f]{7,40}) 100(?:644|755)$/.exec(lines[1] ?? "");
  if (!index || /^0+$/.test(index[1]) || index[1] === index[2] || !file.blobSha!.startsWith(index[2])) return;
  if (!(lines[4] ?? "").startsWith("@@ ")) return;

  const patch = lines.slice(4).join("\n") + "\n";
  if (patch.includes("\0")) return;
  const parsed = inspectReviewPatch(patch);
  if (!parsed.complete || parsed.additions !== file.additions || parsed.deletions !== file.deletions) return;

  // Git emits hunks in file order; each new start is its old start shifted by
  // the line delta of the hunks before it. Empty ranges name the line before.
  let delta = 0, oldEnd = 0;
  for (const hunk of parsed.hunks) {
    if (![hunk.oldStart, hunk.oldLines, hunk.newStart, hunk.newLines].every(n => Number.isSafeInteger(n))) return;
    const oldPos = hunk.oldLines === 0 ? hunk.oldStart + 1 : hunk.oldStart;
    const newPos = hunk.newLines === 0 ? hunk.newStart + 1 : hunk.newStart;
    if (oldPos < 1 || oldPos <= oldEnd || newPos - oldPos !== delta) return;
    oldEnd = oldPos + hunk.oldLines - 1;
    delta += hunk.newLines - hunk.oldLines;
  }
  return patch;
}

/** Recover only whole added text files whose reconstructed bytes match Git's blob. */
export function recoverAddedGitHubTextPatch(
  file: ReviewFileInput,
  revision: { headSha: string; baseSha: string },
  section: string | undefined,
): string | undefined {
  if (!safeSection(file, revision, section) || file.change !== "added"
    || !Number.isSafeInteger(file.additions) || file.additions! <= 0 || file.deletions !== 0) return;

  const lines = section.slice(0, -1).split("\n");
  if (lines[0] !== `diff --git a/${file.path} b/${file.path}`
    || lines[1] !== "new file mode 100644"
    || lines[3] !== "--- /dev/null" || lines[4] !== `+++ b/${file.path}`) return;
  const index = /^index 0{7,40}\.\.([0-9a-f]{7,40})$/.exec(lines[2] ?? "");
  if (!index || !file.blobSha!.startsWith(index[1])) return;
  // One complete added-file hunk avoids trusting arbitrary/overlapping ranges.
  if (!/^@@ -0,0 \+1(?:,[1-9]\d*)? @@(?: .*)?$/.test(lines[5] ?? "")) return;
  const patch = lines.slice(5).join("\n") + "\n";
  const parsed = inspectReviewPatch(patch);
  if (!parsed.complete || parsed.hunks.length !== 1 || parsed.additions !== file.additions
    || parsed.deletions !== 0 || parsed.hunks[0].newLines !== file.additions) return;

  let content = "";
  for (let i = 6; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("+")) content += line.slice(1) + "\n";
    else if (line === "\\ No newline at end of file" && i === lines.length - 1 && content.endsWith("\n")) content = content.slice(0, -1);
    else return;
  }
  if (content.includes("\0")) return;
  const blob = createHash("sha1").update(`blob ${Buffer.byteLength(content)}\0`).update(content).digest("hex");
  return blob === file.blobSha ? patch : undefined;
}
