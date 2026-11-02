import { mock } from "bun:test";
import assert from "node:assert/strict";
mock.module("server-only", () => ({}));

type Body = { stream?: boolean; stream_options?: { include_usage?: boolean }; response_format?: unknown };
const bodies: Body[] = [];
const sse = (data: unknown) => `data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`;
const chunk = (delta: object, finish: string | null = null) =>
  ({ id: "c1", object: "chat.completion.chunk", created: 1, model: "octopus-review", choices: [{ index: 0, delta, finish_reason: finish }] });

// Like OpenAI and LiteLLM, the server sends the usage chunk only when the request asks for it.
const server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
  const body = await req.json() as Body;
  bodies.push(body);
  const events = [chunk({ role: "assistant", content: "Hello " }), chunk({ content: "world" }), chunk({}, "stop")];
  if (body.stream_options?.include_usage) {
    events.push({ id: "c1", object: "chat.completion.chunk", created: 1, model: "octopus-review", choices: [],
      usage: { prompt_tokens: 11, completion_tokens: 2, total_tokens: 13, prompt_tokens_details: { cached_tokens: 5 } } } as never);
  }
  return new Response(events.map(sse).join("") + sse("[DONE]"), { headers: { "content-type": "text/event-stream" } });
} });

process.env.OPENAI_API_KEY = "synthetic-platform";
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${server.port}/v1`;
const { openaiProvider } = await import("../../providers/openai");

try {
  const plain = await openaiProvider.create({ model: "octopus-review", maxTokens: 64, system: "s", messages: [{ role: "user", content: "u" }] });
  assert.equal(bodies.at(-1)?.stream, true);
  assert.equal(plain.text, "Hello world");
  assert.deepEqual(plain.completion, { state: "completed", reason: "stop" });
  assert.deepEqual(plain.usage, { inputTokens: 11, outputTokens: 2, cacheReadTokens: 5, cacheWriteTokens: 0 });
  console.log("PASS streamed text, completion and usage");

  const schema = { name: "verdict", schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false } };
  const structured = await openaiProvider.create({ model: "octopus-utility", maxTokens: 64, messages: [{ role: "user", content: "u" }], responseSchema: schema });
  assert.ok(bodies.at(-1)?.response_format);
  assert.equal(structured.text, "Hello world");
  console.log("PASS streamed call with a response schema");
} finally {
  server.stop(true);
}
