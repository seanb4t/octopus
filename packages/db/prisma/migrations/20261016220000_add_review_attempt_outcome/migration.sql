-- The outcome of a review attempt: what it posted, read by a later push that reuses it.
ALTER TABLE "review_attempts" ADD COLUMN "outcome" JSONB;
