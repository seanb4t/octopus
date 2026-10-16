import { prisma } from "@octopus/db";
import type { ReviewCoverage, ReviewOutcome } from "@/lib/review-coverage";

export type ReusableAttempt = { coverage: ReviewCoverage; outcome: ReviewOutcome };

/**
 * The last attempt on the pull request when a push can reuse it: the attempt
 * completed or was itself a reuse, it has an outcome, its diff fingerprint
 * equals the current one, the same model is in use, and its head differs from
 * the current head. A lookup failure gives null, which reviews.
 */
export async function findReusableAttempt(pullRequestId: string, current: ReviewCoverage, model: string): Promise<ReusableAttempt | null> {
  if (!current.complete || !current.headSha || !current.diffFingerprint) return null;
  try {
    const latest = await prisma.reviewAttempt.findFirst({
      where: { pullRequestId }, orderBy: { createdAt: "desc" }, select: { coverage: true, outcome: true },
    });
    const prior = latest?.coverage as ReviewCoverage | null;
    const outcome = latest?.outcome as ReviewOutcome | null;
    const state = prior?.assessment?.state;
    if (prior?.version !== 1 || prior.complete !== true || (state !== "completed" && state !== "reused")
      || !outcome || !prior.headSha || prior.headSha === current.headSha
      || prior.diffFingerprint !== current.diffFingerprint || prior.assessment?.model !== model) return null;
    return { coverage: prior, outcome };
  } catch (err) {
    console.warn("[reviewer] Failed to look up the earlier attempt for reuse:", err);
    return null;
  }
}
