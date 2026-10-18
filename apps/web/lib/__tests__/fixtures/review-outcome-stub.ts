import { mock } from "bun:test";

/** Each publish through the stub recorder, for a harness that asserts the wiring. */
export const outcomePublications: { state?: string; archiveId: string | null }[] = [];

// Existing isolated review harnesses have no outcome table. Exercise their
// original concern; the PostgreSQL outcome harness tests recording separately.
// Harnesses that exercise the durable generation budget lower `limit`; the PostgreSQL test covers the real claim.
export const generationBudget = { claims: 0, limit: Infinity };
mock.module("@/lib/review-attempt-outcome", () => ({
  claimGenerationAttempt: async () => ++generationBudget.claims <= generationBudget.limit,
  exhaustGenerationAttempts: async () => { generationBudget.limit = 0; },
  startReviewOutcome: async () => {},
  deferReviewOutcome: async () => {},
  supersedeReviewOutcomes: async () => {},
  recordReviewAdmissionAfterCommit: () => {},
  ReviewOutcomeRecorder: class {
    private state?: string;
    private archiveId: string | null = null;
    assessment(coverage?: { assessment?: { state?: string } }, archiveId: string | null = null) {
      this.state = coverage?.assessment?.state;
      this.archiveId = archiveId;
    }
    mainPosted = () => {};
    inlinePosted() {}
    superseded() {}
    async finish() {}
    async publish<T>(operation: () => Promise<T>) {
      outcomePublications.push({ state: this.state, archiveId: this.archiveId });
      return operation();
    }
  },
}));
