import { mock } from "bun:test";

/** Each publish through the stub recorder, for a harness that asserts the wiring. */
export const outcomePublications: { state?: string; archiveId: string | null }[] = [];

// Existing isolated review harnesses have no outcome table. Exercise their
// original concern; the PostgreSQL outcome harness tests recording separately.
mock.module("@/lib/review-attempt-outcome", () => ({
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
