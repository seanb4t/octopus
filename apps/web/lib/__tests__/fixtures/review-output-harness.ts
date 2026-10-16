import { mock } from "bun:test";
import assert from "node:assert/strict";
import type { AiCreateParams, AiResponse } from "../../providers";

// The drop step of the normalizer and the one repair request of a rejected
// response. No provider, database or network service is contacted: every
// provider call is a queue of fixture texts.
mock.module("server-only", () => ({}));
mock.module("@octopus/db", () => ({ prisma: {} }));

const { executeCoveredReview, normalizeReviewResponse, reviewResponseValidationError } = await import("../../review-assessment");
const { prepareReviewInput, reviewAssessmentComplete, sha256 } = await import("../../review-coverage");
const { createCoveredReviewRequest } = await import("../../review-request");
const { observeAiRequest, completionEvidence } = await import("../../providers/request-evidence");

const zeroSummary = "| Severity | Count |\n| --- | --- |\n| 🔴 Critical | 0 |\n| 🟠 High | 0 |\n| 🟡 Medium | 0 |\n| 🔵 Low | 0 |\n| 💡 Nit | 0 |";
const valid = `## 🐙 Octopus Review

### Summary
The changed validator is consistent with its documented contract.

### Score
| Category | Score | Notes |
| --- | --- | --- |
| Security | 5/5 | No security finding |
| Code Quality | 5/5 | Clear implementation |
| Performance | 4/5 | Bounded work |
| Error Handling | 5/5 | Explicit errors |
| Consistency | 5/5 | Consistent |
| **Overall** | **4/5** | Lowest category |

### Findings Summary
${zeroSummary}

### Findings
<!-- OCTOPUS_FINDINGS_START -->
[]
<!-- OCTOPUS_FINDINGS_END -->

Last reviewed commit: ${"a".repeat(40)}
`;
assert.equal(reviewResponseValidationError(valid), null);
const conflictRisk = "> ⚠️ **Conflict Risk**: This PR modifies high-traffic shared files (`app/db.py`). Rebase frequently against `main`.";
const afterTable = (body: string, extra: string) => body.replace("### Findings\n", `${extra}\n\n### Findings\n`);

// ── Trailing prose after the Findings Summary table ─────────────────────────
{
  const logged: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
  const trailing = afterTable(valid, "No further issues were found.");
  const normalized = normalizeReviewResponse(trailing);
  console.log = originalLog;
  assert.ok(!normalized.includes("No further issues were found."), "the sentence is dropped");
  assert.ok(normalized.includes(zeroSummary), "the table stays");
  assert.deepEqual(logged, ["[review-assessment] Dropped 1 line after the Findings Summary table"]);
  assert.equal(reviewResponseValidationError(trailing), null, "a sentence after the table validates");

  const twoLines = afterTable(valid, "One more sentence.\nAnd another one.");
  assert.equal(reviewResponseValidationError(twoLines), null);

  const secondTable = afterTable(valid, "\n| Category | Note |");
  assert.equal(reviewResponseValidationError(secondTable), "Unexpected content after Findings Summary table", "a second table still rejects");
  const secondHeading = afterTable(valid, "### Findings Summary\nSome notes.");
  assert.equal(reviewResponseValidationError(secondHeading), "Findings Summary heading missing or duplicated", "a second summary heading still rejects");

  const withRisk = afterTable(valid, conflictRisk);
  assert.equal(reviewResponseValidationError(withRisk), null, "the Conflict Risk block validates");
  assert.ok(normalizeReviewResponse(withRisk).includes(conflictRisk), "the Conflict Risk block stays");
  const riskThenProse = afterTable(valid, `${conflictRisk}\nA closing remark.`);
  assert.equal(reviewResponseValidationError(riskThenProse), null);
  assert.ok(normalizeReviewResponse(riskThenProse).includes(conflictRisk));
  assert.ok(!normalizeReviewResponse(riskThenProse).includes("A closing remark."));
  assert.equal(normalizeReviewResponse(valid), valid, "a valid review is unchanged");
}
console.log("PASS trailing prose after the Findings Summary table is dropped and logged");

// ── One repair request after a rejected response ────────────────────────────
function plan() {
  const result = prepareReviewInput({ provider: "github", headSha: "a".repeat(40), baseSha: "b".repeat(40), inventoryComplete: true, expectedFiles: 1, limitations: [], files: [{ path: "src/validator.ts", change: "added", patch: "@@ -0,0 +1 @@\n+export const valid = true;\n", additions: 1, deletions: 0 }] }, { maxChars: 300000 });
  result.coverage.reviewRequestVersion = 1;
  return result;
}
const requestFor = (p: ReturnType<typeof plan>): AiCreateParams => createCoveredReviewRequest({ model: "gpt-test", system: "Trusted review template", number: 1, title: "Validators", author: "fixture", diff: p.diff, coverage: p.coverage, comment: "", repoConfig: "" });
const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const queuedCall = (texts: (string | Error)[], seen: AiCreateParams[]) => async (request: AiCreateParams): Promise<AiResponse> => {
  seen.push(request);
  const text = texts.shift();
  assert.ok(text !== undefined, "a provider call with no queued response");
  if (text instanceof Error) throw text;
  observeAiRequest(request, "openai", { model: request.model, system: request.system, messages: request.messages });
  return { text, provider: "openai", model: request.model, completion: completionEvidence("stop", ["stop"]), usage };
};
const headingless = valid.replace("### Summary\n", "");
const reason = "Review headings missing or duplicated";
assert.equal(reviewResponseValidationError(headingless), reason);

const logged: string[] = [];
const originalLog = console.log;
console.log = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };

// The repair is accepted: the review proceeds as valid with the repaired text.
{
  const p = plan();
  const seen: AiCreateParams[] = [];
  const response = await executeCoveredReview(requestFor(p), p.coverage, "v1", queuedCall([headingless, valid], seen));
  assert.equal(seen.length, 2, "one primary request and one repair request");
  const messages = seen[1].messages;
  assert.deepEqual(messages.slice(0, -2), seen[0].messages, "the repair carries the conversation so far");
  assert.deepEqual(messages.at(-2), { role: "assistant", content: headingless });
  assert.equal(messages.at(-1)?.role, "user");
  assert.ok(messages.at(-1)?.content.startsWith(`Your review was rejected: ${reason}.`));
  assert.equal(seen[1].completeReviewAdmission, undefined, "the primary admission is not sent again");
  assert.equal(response.text, valid);
  const assessment = p.coverage.assessment!;
  assert.equal(assessment.state, "completed");
  assert.equal(reviewAssessmentComplete(p.coverage), true);
  assert.equal(assessment.requests.length, 1);
  assert.equal(assessment.responseSha256, sha256(valid));
  assert.equal(assessment.responseValidation?.state, "valid");
  assert.deepEqual({ ...assessment.repair, requests: assessment.repair?.requests.length }, {
    reason, rejectedSha256: sha256(headingless), requests: 1, responseSha256: sha256(valid),
    completion: completionEvidence("stop", ["stop"]), responseValidation: { state: "valid", reason: null },
  });
}
// The repair is rejected too: the assessment stays incomplete with both reasons.
{
  const p = plan();
  const seen: AiCreateParams[] = [];
  const response = await executeCoveredReview(requestFor(p), p.coverage, "v1", queuedCall([headingless, headingless], seen));
  assert.equal(seen.length, 2);
  assert.equal(response.text, normalizeReviewResponse(headingless), "the first response stays the result");
  const assessment = p.coverage.assessment!;
  assert.equal(assessment.state, "incomplete");
  assert.equal(assessment.responseValidation?.reason, reason, "the primary reason stays");
  assert.equal(assessment.responseSha256, sha256(headingless));
  assert.deepEqual(assessment.repair?.responseValidation, { state: "invalid", reason }, "the repair reason is in the repair evidence");
  assert.equal(assessment.repair?.responseSha256, sha256(headingless));
  assert.ok(assessment.reason.includes(reason));
}
// The repair request fails: the first response stays, and the failure is in the reason.
{
  const p = plan();
  const seen: AiCreateParams[] = [];
  await executeCoveredReview(requestFor(p), p.coverage, "v1", queuedCall([headingless, new Error("socket closed")], seen));
  assert.equal(seen.length, 2);
  const assessment = p.coverage.assessment!;
  assert.equal(assessment.state, "incomplete");
  assert.equal(assessment.responseValidation?.reason, reason);
  assert.deepEqual(assessment.repair?.responseValidation, { state: "invalid", reason: "Repair request failed or was interrupted" });
  assert.equal(assessment.repair?.requests.length, 0);
  assert.equal(assessment.repair?.responseSha256, null);
}
// A valid first response sends no repair request.
{
  const p = plan();
  const seen: AiCreateParams[] = [];
  await executeCoveredReview(requestFor(p), p.coverage, "v1", queuedCall([valid], seen));
  assert.equal(seen.length, 1);
  assert.equal(p.coverage.assessment?.repair, undefined);
  assert.equal(p.coverage.assessment?.state, "completed");
}
// A findings JSON problem goes to the findings recovery, not to a repair.
{
  const p = plan();
  const seen: AiCreateParams[] = [];
  const malformedJson = valid.replace("[]", "[,]");
  assert.equal(reviewResponseValidationError(malformedJson), "Findings JSON is malformed");
  await executeCoveredReview(requestFor(p), p.coverage, "v1", queuedCall([malformedJson, valid], seen));
  assert.equal(seen.length, 1, "no repair request for a findings JSON problem");
  assert.equal(p.coverage.assessment?.repair, undefined);
  assert.equal(p.coverage.assessment?.state, "incomplete");
}
// A capacity-admitted complete review gets no repair.
{
  const p = plan();
  const seen: AiCreateParams[] = [];
  const admitted = { ...requestFor(p), completeReviewAdmission: {} as AiCreateParams["completeReviewAdmission"] };
  await executeCoveredReview(admitted, p.coverage, "v1", queuedCall([headingless, valid], seen));
  assert.equal(seen.length, 1, "no repair request under a capacity admission");
  assert.equal(p.coverage.assessment?.repair, undefined);
}
console.log = originalLog;
const rejectedLines = logged.filter(line => line.startsWith("[review-assessment] Response rejected: "));
const repairedLines = logged.filter(line => line.startsWith("[review-assessment] Response repaired: "));
assert.equal(rejectedLines.length, 6, "one rejection per rejected response: 1 + 2 + 1 + 0 + 1 + 1 across the six cases");
assert.deepEqual(repairedLines, [`[review-assessment] Response repaired: ${reason}`]);
console.log("PASS a rejected response gets one repair request");
