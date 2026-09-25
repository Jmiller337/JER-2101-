import Anthropic from "@anthropic-ai/sdk";
import type { ModelClient, ModelMessage, ModelStream, ModelStreamEvent, StreamParams } from "./anthropic";

/**
 * A scripted stand-in for the Anthropic API, used by route tests and by the end-to-end tests
 * (FAKE_MODEL=1). It emits the same raw stream events as the SDK so the handlers run unchanged.
 */
export interface FakeScript {
  /** Text deltas, in order. */
  chunks: string[];
  /** Delay before each chunk, in milliseconds. */
  delayMs?: number;
  stopReason?: string;
  /** Throw `error` after this many chunks have been sent. */
  failAfterChunks?: number;
  error?: unknown;
  usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number };
}

export class FakeModelStream implements ModelStream {
  private aborted = false;

  constructor(
    private readonly script: FakeScript,
    private readonly signal?: AbortSignal,
    private readonly model = "fake-model",
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterator<ModelStreamEvent> {
    const event = (value: unknown) => value as ModelStreamEvent;
    yield event({ type: "message_start", message: this.messageShell(null) });
    yield event({ type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: null } });
    let sent = 0;
    for (const chunk of this.script.chunks) {
      if (this.script.failAfterChunks !== undefined && sent >= this.script.failAfterChunks) {
        throw this.script.error ?? new Error("scripted failure");
      }
      if (this.script.delayMs) await sleep(this.script.delayMs);
      if (this.aborted || this.signal?.aborted) throw new Anthropic.APIUserAbortError();
      yield event({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: chunk } });
      sent += 1;
    }
    if (this.script.failAfterChunks !== undefined && sent >= this.script.failAfterChunks) {
      throw this.script.error ?? new Error("scripted failure");
    }
    yield event({ type: "content_block_stop", index: 0 });
    yield event({
      type: "message_delta",
      delta: { stop_reason: this.script.stopReason ?? "end_turn", stop_sequence: null },
      usage: { output_tokens: this.script.usage?.output_tokens ?? 0 },
    });
    yield event({ type: "message_stop" });
  }

  async finalMessage(): Promise<ModelMessage> {
    return this.messageShell(this.script.stopReason ?? "end_turn");
  }

  abort(): void {
    this.aborted = true;
  }

  private messageShell(stopReason: string | null): ModelMessage {
    return {
      id: "msg_fake",
      type: "message",
      role: "assistant",
      model: this.model,
      content: [{ type: "text", text: this.script.chunks.join(""), citations: null }],
      stop_reason: stopReason,
      stop_sequence: null,
      usage: {
        input_tokens: this.script.usage?.input_tokens ?? 0,
        output_tokens: this.script.usage?.output_tokens ?? 0,
        cache_read_input_tokens: this.script.usage?.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: 0,
      },
    } as unknown as ModelMessage;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Splits text into small pieces so the fake stream arrives the way a real one does. */
export function chunkText(text: string, size = 24): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

// ---------------------------------------------------------------------------
// The default scripts used with FAKE_MODEL=1
// ---------------------------------------------------------------------------

const PAGE_ONE = [
  {
    type: "meta",
    status: "ok",
    language: "en",
    kind: "bill",
    title: "A water bill from Riverside Water Utility for October",
  },
  { type: "block", kind: "heading", text: "Riverside Water Utility" },
  { type: "block", kind: "paragraph", text: "Dear Ms. Alvarez, thank you for being a customer. Your October bill is ready." },
  { type: "block", kind: "note", text: "A table with 2 rows. Columns: Description, Amount." },
  { type: "block", kind: "table_row", text: "Description: Water service. Amount: $61.40." },
  { type: "block", kind: "table_row", text: "Description: Sewer service. Amount: $22.72." },
  { type: "block", kind: "label_value", text: "Amount due: $84.12. Due date: October 28, 2026." },
  { type: "block", kind: "paragraph", text: "Questions? Call 555-0142 [?] between 8 a.m. and 5 p.m." },
  { type: "done", blocks: 7 },
];

const PAGE_TWO = [
  {
    type: "meta",
    status: "ok",
    language: "en",
    kind: "bill",
    title: "The second page of the water bill",
  },
  { type: "block", kind: "heading", text: "Ways to pay" },
  { type: "block", kind: "list_item", text: "Online at riverside water dot example." },
  { type: "block", kind: "list_item", text: "By mail with the slip below, signed by [unclear] Alvarez." },
  { type: "done", blocks: 3 },
];

/** A two-page PDF: the page line between the pages is what the real model writes too. */
const PDF_DOCUMENT = [
  {
    type: "meta",
    status: "ok",
    language: "en",
    kind: "letter",
    title: "A two-page letter from Riverside Library about a returned book",
  },
  { type: "block", kind: "heading", text: "Riverside Library" },
  { type: "block", kind: "paragraph", text: "Dear Ms. Alvarez, thank you for returning The Long Road." },
  { type: "block", kind: "paragraph", text: "The book was returned on September 3, 2026, eight days late." },
  { type: "page" },
  { type: "block", kind: "label_value", text: "Late fee: $2.40." },
  { type: "block", kind: "paragraph", text: "You can pay at the front desk or by phone at 555-0199." },
  { type: "done", blocks: 5 },
];

function pdfScript(): FakeScript {
  const lines = PDF_DOCUMENT.map((line) => JSON.stringify(line)).join("\n");
  return { chunks: chunkText(`${lines}\n`), delayMs: 25, usage: { input_tokens: 6100, output_tokens: 260 } };
}

function readScript(pageNumber: number): FakeScript {
  const lines = (pageNumber % 2 === 1 ? PAGE_ONE : PAGE_TWO).map((line) => JSON.stringify(line)).join("\n");
  return { chunks: chunkText(`${lines}\n`), delayMs: 25, usage: { input_tokens: 4300, output_tokens: 320 } };
}

function askScript(question: string): FakeScript {
  const answer = /due|when|owe|amount|how much/i.test(question)
    ? "You owe 84 dollars and 12 cents, and it is due on October 28, 2026."
    : /phone|call|number/i.test(question)
      ? "The phone number is 555-0142, and they answer between 8 in the morning and 5 in the afternoon."
      : "This is a water bill from Riverside Water Utility for October.";
  return { chunks: chunkText(answer, 12), delayMs: 30, usage: { input_tokens: 900, output_tokens: 30 } };
}

export function createFakeModelClient(): ModelClient {
  return {
    stream(params: StreamParams, options?: { signal?: AbortSignal }): ModelStream {
      const first = params.messages[0];
      const content = Array.isArray(first?.content) ? first.content : [];
      if (content.some((part) => part.type === "document")) {
        return new FakeModelStream(pdfScript(), options?.signal, params.model);
      }
      const hasImage = content.some((part) => part.type === "image");
      if (hasImage) {
        const text = content.find((part) => part.type === "text");
        const pageText = text && text.type === "text" ? text.text : "";
        const pageNumber = Number(/Page (\d+)/.exec(pageText)?.[1] ?? "1");
        return new FakeModelStream(readScript(pageNumber), options?.signal, params.model);
      }
      const last = params.messages[params.messages.length - 1];
      const question = typeof last?.content === "string" ? last.content : "";
      return new FakeModelStream(askScript(question), options?.signal, params.model);
    },
  };
}
