import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { chunkText } from "@/lib/server/fakeModel";
import { SpeedPolicy } from "@/lib/server/attempts";
import { READ_PDF_SYSTEM_PROMPT, READ_SYSTEM_PROMPT, readPdfSystemPrompt, readSystemPrompt } from "@/lib/server/prompts";
import { handleRead } from "@/lib/server/readHandler";
import { IMAGE_DATA, makeDeps, ndjson, postJson, readNdjson, TEST_ENV } from "./helpers";

const META = { type: "meta", status: "ok", language: "en", kind: "letter", title: "A letter" };
const BLOCK = { type: "block", kind: "paragraph", text: "Hello there." };
const GOOD_BODY = { image: { mediaType: "image/jpeg", data: IMAGE_DATA }, pageNumber: 1, languageHint: null };

/** The system prompt of a request (sent as one cached text block). */
function systemText(params: { system?: unknown }): string {
  const blocks = params.system as Array<{ text: string }>;
  return blocks.map((b) => b.text).join("");
}

describe("POST /api/read", () => {
  it("streams meta, blocks, and done", async () => {
    const deps = makeDeps({ chunks: chunkText(ndjson(META, BLOCK, { type: "done", blocks: 1 }), 9) });
    const res = await handleRead(postJson("/api/read", GOOD_BODY), deps);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/x-ndjson");
    expect(res.headers.get("cache-control")).toContain("no-transform");
    expect(await readNdjson(res)).toEqual([META, BLOCK, { type: "done", blocks: 1 }]);
    expect(deps.logs[0]).toMatchObject({ route: "read", outcome: "ok", blocks: 1, parserMode: "ndjson" });
  });

  it("builds the model request described in the spec", async () => {
    const deps = makeDeps({ chunks: [ndjson(META)] });
    const res = await handleRead(postJson("/api/read", { ...GOOD_BODY, pageNumber: 3, languageHint: "es" }), deps);
    await res.text();
    const params = deps.calls[0]!;
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.max_tokens).toBe(16000);
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01", "fast-mode-2026-02-01"]);
    expect(params.fallbacks).toBe("default");
    expect(params.speed).toBe("fast");
    expect(params.output_config).toEqual({ effort: "high" });
    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("temperature");
    // The system prompt is the same for every read, so it is cached for the demo's hour.
    expect(params.system).toEqual([
      { type: "text", text: READ_SYSTEM_PROMPT, cache_control: { type: "ephemeral", ttl: "1h" } },
    ]);
    expect(deps.logs[0]).toMatchObject({ speed: "fast", attempts: 1 });
    const content = params.messages[0]!.content as Array<{ type: string; text?: string }>;
    expect(content.map((c) => c.type)).toEqual(["image", "text"]);
    expect(content[1]!.text).toBe(
      "Page 3. Read this page. The document is probably in es. No question was asked: the answer line says what this is and its headline fact.",
    );
  });

  it("sends the question asked before the photo, and streams the answer before the text", async () => {
    const ANSWER = { type: "answer", text: "The amount due is $84.12." };
    const deps = makeDeps({ chunks: chunkText(ndjson(META, ANSWER, BLOCK, { type: "done", blocks: 1 }), 11) });
    const res = await handleRead(postJson("/api/read", { ...GOOD_BODY, question: "the amount due" }), deps);
    expect(await readNdjson(res)).toEqual([META, ANSWER, BLOCK, { type: "done", blocks: 1 }]);
    const content = deps.calls[0]!.messages[0]!.content as Array<{ type: string; text?: string }>;
    expect(content[1]!.text).toBe(
      'Page 1. Read this page. Before taking the photo the listener asked: "the amount due". The answer line answers that.',
    );
    // The log says a question came, never what it was.
    expect(deps.logs[0]).toMatchObject({ asked: true });
    expect(JSON.stringify(deps.logs[0])).not.toContain("amount due");
  });

  it("leaves translation off by default: the prompt is unchanged and no page is marked translated", async () => {
    const deps = makeDeps({ chunks: [ndjson({ ...META, translatedFrom: "fr" }, BLOCK)] });
    const res = await handleRead(postJson("/api/read", GOOD_BODY), deps);
    expect((await readNdjson(res))[0]).toEqual(META);
    expect(systemText(deps.calls[0]!)).toBe(READ_SYSTEM_PROMPT);
  });

  it("with TRANSLATE_FROM=fr, asks for French pages in English and says which were translated", async () => {
    const env = { ...TEST_ENV, translateFrom: ["fr"] };
    const deps = makeDeps({ chunks: chunkText(ndjson({ ...META, translatedFrom: "fr" }, BLOCK), 13) }, { env });
    const res = await handleRead(postJson("/api/read", GOOD_BODY), deps);
    expect(await readNdjson(res)).toEqual([{ ...META, translatedFrom: "fr" }, BLOCK, { type: "done", blocks: 1 }]);
    expect(systemText(deps.calls[0]!)).toBe(readSystemPrompt(["fr"]));
    expect(systemText(deps.calls[0]!)).not.toBe(READ_SYSTEM_PROMPT);

    const pdfDeps = makeDeps({ chunks: [ndjson(META)] }, { env });
    await (await handleRead(postJson("/api/read", { pdf: { data: IMAGE_DATA }, pageNumber: 1 }), pdfDeps)).text();
    expect(systemText(pdfDeps.calls[0]!)).toBe(readPdfSystemPrompt(["fr"]));
    expect(systemText(pdfDeps.calls[0]!)).not.toBe(READ_PDF_SYSTEM_PROMPT);
  });

  it("rejects an empty or overlong question", async () => {
    for (const question of ["   ", "x".repeat(301)]) {
      const res = await handleRead(postJson("/api/read", { ...GOOD_BODY, question }), makeDeps({ chunks: [] }));
      expect(res.status).toBe(400);
    }
  });

  it("delivers the first event before the model finishes", async () => {
    const lines = [META, ...Array.from({ length: 8 }, (_, i) => ({ ...BLOCK, text: `Paragraph ${i}.` }))];
    const deps = makeDeps({ chunks: lines.map((l) => `${JSON.stringify(l)}\n`), delayMs: 40 });
    const started = Date.now();
    const res = await handleRead(postJson("/api/read", GOOD_BODY), deps);
    const reader = res.body!.getReader();
    const first = await reader.read();
    const firstAt = Date.now() - started;
    expect(new TextDecoder().decode(first.value)).toContain('"type":"meta"');
    let rest = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      rest += new TextDecoder().decode(value);
    }
    const totalAt = Date.now() - started;
    expect(firstAt).toBeLessThan(totalAt - 200);
    expect(rest).toContain('"type":"done"');
  });

  it("turns a refusal into a spoken error after any partial output", async () => {
    const deps = makeDeps({ chunks: [ndjson(META, BLOCK)], stopReason: "refusal" });
    const events = await readNdjson(await handleRead(postJson("/api/read", GOOD_BODY), deps));
    expect(events.map((e) => e.type)).toEqual(["meta", "block", "error"]);
    expect(events[2]).toMatchObject({ code: "refusal", message: "I couldn't read this page. Try again or try another page." });
    expect(deps.logs[0]).toMatchObject({ outcome: "refusal", stopReason: "refusal" });
  });

  it("asks for standard speed, without the fast-mode beta, when MODEL_SPEED is standard", async () => {
    const deps = makeDeps({ chunks: [ndjson(META)] }, { env: { ...TEST_ENV, speed: "standard", readEffort: "max" } });
    await (await handleRead(postJson("/api/read", GOOD_BODY), deps)).text();
    const params = deps.calls[0]!;
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params).not.toHaveProperty("speed");
    expect(params.output_config).toEqual({ effort: "max" });
    expect(deps.logs[0]).toMatchObject({ speed: "standard", attempts: 1 });
  });

  it("falls back to standard speed when fast mode is refused, and stops asking for it", async () => {
    const refused = new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error" } }, "no fast", new Headers());
    let calls = 0;
    const deps = makeDeps(() => (++calls === 1 ? { chunks: [], failAfterChunks: 0, error: refused } : { chunks: [ndjson(META, BLOCK)] }));
    const events = await readNdjson(await handleRead(postJson("/api/read", GOOD_BODY), deps));
    expect(events.map((e) => e.type)).toEqual(["meta", "block", "done"]);
    expect(deps.calls.map((c) => c.speed)).toEqual(["fast", undefined]);
    expect(deps.logs[0]).toMatchObject({ outcome: "ok", attempts: 2, speed: "standard" });
    // The next request goes straight to standard speed.
    await readNdjson(await handleRead(postJson("/api/read", GOOD_BODY), deps));
    expect(deps.calls).toHaveLength(3);
    expect(deps.calls[2]).not.toHaveProperty("speed");
    expect(deps.speed.fastAvailable).toBe(false);
  });

  it("a busy fast pool falls back for that request only, and a busy service gets one more try", async () => {
    const busy = new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error" } }, "slow down", new Headers());
    let calls = 0;
    const deps = makeDeps(() => (++calls <= 2 ? { chunks: [], failAfterChunks: 0, error: busy } : { chunks: [ndjson(META, BLOCK)] }));
    const events = await readNdjson(await handleRead(postJson("/api/read", GOOD_BODY), deps));
    expect(events.map((e) => e.type)).toEqual(["meta", "block", "done"]);
    expect(deps.calls.map((c) => c.speed)).toEqual(["fast", undefined, undefined]);
    expect(deps.logs[0]).toMatchObject({ attempts: 3 });
    expect(deps.speed.fastAvailable).toBe(true);
    await readNdjson(await handleRead(postJson("/api/read", GOOD_BODY), deps));
    expect(deps.calls[3]!.speed).toBe("fast");
  });

  it("gives up after the last attempt, with the error spoken", async () => {
    const busy = new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error" } }, "slow down", new Headers());
    const deps = makeDeps({ chunks: [], failAfterChunks: 0, error: busy });
    const events = await readNdjson(await handleRead(postJson("/api/read", GOOD_BODY), deps));
    expect(events).toEqual([expect.objectContaining({ type: "error", code: "rate_limited" })]);
    expect(deps.calls).toHaveLength(3);
    expect(deps.logs[0]).toMatchObject({ outcome: "error", code: "rate_limited", attempts: 3 });
  });

  it("never retries after the phone has heard something, nor a request that is wrong, nor a key that is refused", async () => {
    const wrong = new Anthropic.BadRequestError(400, { type: "error", error: { type: "invalid_request_error" } }, "bad", new Headers());
    const standard = { ...TEST_ENV, speed: "standard" as const };
    const wrongDeps = makeDeps({ chunks: [], failAfterChunks: 0, error: wrong }, { env: standard });
    expect(await readNdjson(await handleRead(postJson("/api/read", GOOD_BODY), wrongDeps))).toEqual([
      expect.objectContaining({ type: "error", code: "bad_request" }),
    ]);
    expect(wrongDeps.calls).toHaveLength(1);
    const denied = new Anthropic.AuthenticationError(401, { type: "error", error: { type: "authentication_error" } }, "key", new Headers());
    const deniedDeps = makeDeps({ chunks: [], failAfterChunks: 0, error: denied });
    await readNdjson(await handleRead(postJson("/api/read", GOOD_BODY), deniedDeps));
    expect(deniedDeps.calls).toHaveLength(1);
    expect(deniedDeps.speed.fastAvailable).toBe(true);
  });

  it("maps a mid-stream API error to an error event", async () => {
    const error = new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error" } }, "slow down", new Headers());
    const deps = makeDeps({ chunks: [ndjson(META), ndjson(BLOCK)], failAfterChunks: 1, error });
    const events = await readNdjson(await handleRead(postJson("/api/read", GOOD_BODY), deps));
    expect(events.map((e) => e.type)).toEqual(["meta", "error"]);
    expect(events[1]).toMatchObject({ code: "rate_limited" });
    expect(deps.calls).toHaveLength(1);
  });

  it("maps an overloaded error that arrives inside the stream, after every attempt", async () => {
    const error = new Anthropic.APIError(undefined, { type: "error", error: { type: "overloaded_error" } }, "overloaded", undefined);
    const deps = makeDeps({ chunks: [], failAfterChunks: 0, error }, { env: { ...TEST_ENV, speed: "standard" } });
    const events = await readNdjson(await handleRead(postJson("/api/read", GOOD_BODY), deps));
    expect(events).toEqual([expect.objectContaining({ type: "error", code: "overloaded" })]);
    expect(deps.calls).toHaveLength(2);
    expect(deps.calls.map((c) => c.speed)).toEqual([undefined, undefined]);
  });

  it("uses one speed policy across requests", () => {
    const policy = new SpeedPolicy();
    expect(policy.attempts("fast").map((a) => [a.speed, a.maxRetries])).toEqual([
      ["fast", 0],
      ["standard", 2],
      ["standard", 0],
    ]);
    expect(policy.attempts("standard").map((a) => a.speed)).toEqual(["standard", "standard"]);
    policy.fastFailed("rate_limited");
    expect(policy.fastAvailable).toBe(true);
    policy.fastFailed("bad_request");
    expect(policy.fastAvailable).toBe(false);
    expect(policy.attempts("fast").map((a) => a.speed)).toEqual(["standard", "standard"]);
  });

  it("rejects a wrong passcode with 401 before calling the model", async () => {
    const deps = makeDeps({ chunks: [] });
    const res = await handleRead(postJson("/api/read", GOOD_BODY, { authorization: "Bearer wrong" }), deps);
    expect(res.status).toBe(401);
    expect(deps.calls).toHaveLength(0);
  });

  it("rejects a foreign origin with 403", async () => {
    const deps = makeDeps({ chunks: [] });
    const res = await handleRead(postJson("/api/read", GOOD_BODY, { origin: "https://evil.test" }), deps);
    expect(res.status).toBe(403);
  });

  it("reports a missing API key as not configured", async () => {
    const deps = makeDeps({ chunks: [] }, { modelConfigured: false });
    const res = await handleRead(postJson("/api/read", GOOD_BODY), deps);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "not_configured" });
  });

  it("reports a missing passcode setting as not configured", async () => {
    const deps = makeDeps({ chunks: [] }, { env: { ...TEST_ENV, passcode: undefined } });
    expect((await handleRead(postJson("/api/read", GOOD_BODY), deps)).status).toBe(500);
  });

  it("rejects bodies over 21 MB with 413", async () => {
    const deps = makeDeps({ chunks: [] });
    const big = { ...GOOD_BODY, pdf: { data: "A".repeat(21 * 1024 * 1024 + 10) }, image: undefined };
    const res = await handleRead(postJson("/api/read", big), deps);
    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: "too_large" });
  });

  it("sends a PDF to the model as a document and numbers its pages", async () => {
    const deps = makeDeps({
      chunks: chunkText(ndjson(META, BLOCK, { type: "page" }, { type: "block", kind: "paragraph", text: "Page two." }, { type: "done", blocks: 2 }), 11),
    });
    const res = await handleRead(postJson("/api/read", { pdf: { data: IMAGE_DATA }, pageNumber: 4, languageHint: null }), deps);
    expect(await readNdjson(res)).toEqual([
      META,
      BLOCK,
      { type: "page", number: 5 },
      { type: "block", kind: "paragraph", text: "Page two." },
      { type: "done", blocks: 2 },
    ]);
    const params = deps.calls[0]!;
    expect(params.max_tokens).toBe(64000);
    expect(params.output_config).toEqual({ effort: "high" });
    expect(systemText(params)).toContain("You receive a PDF");
    const content = params.messages[0]!.content as Array<{ type: string; source?: unknown }>;
    expect(content.map((c) => c.type)).toEqual(["document", "text"]);
    expect(content[0]!.source).toEqual({ type: "base64", media_type: "application/pdf", data: IMAGE_DATA });
    expect(deps.logs[0]).toMatchObject({ outcome: "ok", pages: 2, pdfChars: IMAGE_DATA.length });
  });

  it("requires exactly one of a photo and a PDF", async () => {
    const deps = makeDeps({ chunks: [] });
    const both = { ...GOOD_BODY, pdf: { data: IMAGE_DATA } };
    expect((await handleRead(postJson("/api/read", both), deps)).status).toBe(400);
    const neither = { pageNumber: 1, languageHint: null };
    expect((await handleRead(postJson("/api/read", neither), deps)).status).toBe(400);
    expect(deps.calls).toHaveLength(0);
  });

  it("ignores page lines when reading a photo", async () => {
    const deps = makeDeps({ chunks: [ndjson(META, BLOCK, { type: "page" }, BLOCK)] });
    const events = await readNdjson(await handleRead(postJson("/api/read", GOOD_BODY), deps));
    expect(events.map((e) => e.type)).toEqual(["meta", "block", "block", "done"]);
  });

  it("rejects malformed JSON and invalid images with 400", async () => {
    const deps = makeDeps({ chunks: [] });
    expect((await handleRead(postJson("/api/read", "{nope"), deps)).status).toBe(400);
    const gif = { ...GOOD_BODY, image: { mediaType: "image/gif", data: IMAGE_DATA } };
    expect((await handleRead(postJson("/api/read", gif), deps)).status).toBe(400);
    const newline = { ...GOOD_BODY, image: { mediaType: "image/jpeg", data: `${IMAGE_DATA}\n${IMAGE_DATA}` } };
    expect((await handleRead(postJson("/api/read", newline), deps)).status).toBe(400);
    expect(deps.calls).toHaveLength(0);
  });

  it("stops the model call when the phone disconnects", async () => {
    const lines = Array.from({ length: 50 }, (_, i) => `${JSON.stringify({ ...BLOCK, text: `P${i}.` })}\n`);
    const deps = makeDeps({ chunks: [ndjson(META), ...lines], delayMs: 20 });
    const res = await handleRead(postJson("/api/read", GOOD_BODY), deps);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(deps.logs[0]).toMatchObject({ outcome: "aborted" });
  });
});
