import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { buildAskParams, handleAsk, trimHistory } from "@/lib/server/askHandler";
import { chunkText } from "@/lib/server/fakeModel";
import { makeDeps, postJson, readNdjson, TEST_ENV } from "./helpers";

const BODY = {
  pages: ["## Riverside Water Utility\nAmount due: $84.12.", "Second page."],
  title: "A water bill",
  history: [],
  question: "How much do I owe?",
};

describe("POST /api/ask", () => {
  it("streams the answer as text events and ends with done", async () => {
    const deps = makeDeps({ chunks: chunkText("You owe 84 dollars and 12 cents.", 8) });
    const events = await readNdjson(await handleAsk(postJson("/api/ask", BODY), deps));
    expect(events.filter((e) => e.type === "text").map((e) => e.text).join("")).toBe("You owe 84 dollars and 12 cents.");
    expect(events.at(-1)).toEqual({ type: "done" });
    expect(deps.logs[0]).toMatchObject({ route: "ask", outcome: "ok" });
  });

  it("builds the request described in the spec, with the transcript cached", () => {
    const params = buildAskParams(TEST_ENV, {
      ...BODY,
      history: [
        { role: "user", content: "Who is it from?" },
        { role: "assistant", content: "Riverside Water Utility." },
      ],
    });
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config).toEqual({ effort: "medium" });
    expect(params.fallbacks).toBe("default");
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    const system = params.system as Array<{ text: string; cache_control?: unknown }>;
    expect(system).toHaveLength(2);
    expect(system[0]!.cache_control).toBeUndefined();
    expect(system[1]!.cache_control).toEqual({ type: "ephemeral" });
    expect(system[1]!.text).toContain('<page number="2">');
    expect(system[1]!.text).toContain("Amount due: $84.12.");
    expect(params.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(params.messages.at(-1)!.content).toBe("How much do I owe?");
  });

  it("keeps the last ten turns and starts them with a question", () => {
    const history = Array.from({ length: 13 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `turn ${i}`,
    }));
    const trimmed = trimHistory(history);
    expect(trimmed.length).toBeLessThanOrEqual(10);
    expect(trimmed[0]!.role).toBe("user");
    expect(trimmed.at(-1)!.content).toBe("turn 12");
  });

  it("turns a refusal into a spoken error", async () => {
    const deps = makeDeps({ chunks: [], stopReason: "refusal" });
    const events = await readNdjson(await handleAsk(postJson("/api/ask", BODY), deps));
    expect(events).toEqual([
      { type: "error", code: "refusal", message: "I couldn't answer that question. Try asking it another way." },
    ]);
  });

  it("reports an empty answer", async () => {
    const deps = makeDeps({ chunks: [] });
    const events = await readNdjson(await handleAsk(postJson("/api/ask", BODY), deps));
    expect(events).toEqual([expect.objectContaining({ type: "error", code: "empty" })]);
  });

  it("maps API errors", async () => {
    const error = new Anthropic.InternalServerError(529, { type: "error", error: { type: "overloaded_error" } }, "busy", new Headers());
    const deps = makeDeps({ chunks: ["Partial"], failAfterChunks: 1, error });
    const events = await readNdjson(await handleAsk(postJson("/api/ask", BODY), deps));
    expect(events.map((e) => e.type)).toEqual(["text", "error"]);
    expect(events[1]).toMatchObject({ code: "overloaded" });
  });

  it("validates the passcode and the body", async () => {
    const deps = makeDeps({ chunks: [] });
    expect((await handleAsk(postJson("/api/ask", BODY, { authorization: "Bearer nope" }), deps)).status).toBe(401);
    expect((await handleAsk(postJson("/api/ask", { ...BODY, question: "   " }), deps)).status).toBe(400);
    expect((await handleAsk(postJson("/api/ask", { ...BODY, pages: [] }), deps)).status).toBe(400);
    expect(deps.calls).toHaveLength(0);
  });
});
