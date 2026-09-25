import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { chunkText } from "@/lib/server/fakeModel";
import { handleRead } from "@/lib/server/readHandler";
import { IMAGE_DATA, makeDeps, ndjson, postJson, readNdjson, TEST_ENV } from "./helpers";

const META = { type: "meta", status: "ok", language: "en", kind: "letter", title: "A letter" };
const BLOCK = { type: "block", kind: "paragraph", text: "Hello there." };
const GOOD_BODY = { image: { mediaType: "image/jpeg", data: IMAGE_DATA }, pageNumber: 1, languageHint: null };

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
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.fallbacks).toBe("default");
    expect(params.output_config).toEqual({ effort: "high" });
    expect(params).not.toHaveProperty("thinking");
    expect(params).not.toHaveProperty("temperature");
    const content = params.messages[0]!.content as Array<{ type: string; text?: string }>;
    expect(content.map((c) => c.type)).toEqual(["image", "text"]);
    expect(content[1]!.text).toBe("Page 3. Read this page. The document is probably in es.");
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

  it("maps a mid-stream API error to an error event", async () => {
    const error = new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error" } }, "slow down", new Headers());
    const deps = makeDeps({ chunks: [ndjson(META), ndjson(BLOCK)], failAfterChunks: 1, error });
    const events = await readNdjson(await handleRead(postJson("/api/read", GOOD_BODY), deps));
    expect(events.map((e) => e.type)).toEqual(["meta", "error"]);
    expect(events[1]).toMatchObject({ code: "rate_limited" });
  });

  it("maps an overloaded error that arrives inside the stream", async () => {
    const error = new Anthropic.APIError(undefined, { type: "error", error: { type: "overloaded_error" } }, "overloaded", undefined);
    const deps = makeDeps({ chunks: [], failAfterChunks: 0, error });
    const events = await readNdjson(await handleRead(postJson("/api/read", GOOD_BODY), deps));
    expect(events).toEqual([expect.objectContaining({ type: "error", code: "overloaded" })]);
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
    expect(String(params.system)).toContain("You receive a PDF");
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
