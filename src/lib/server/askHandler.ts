import { spokenError } from "@/lib/shared/messages";
import { toNdjsonLine } from "@/lib/shared/ndjson";
import type { AskEvent, AskRequest, ChatTurn, ErrorCode } from "@/lib/shared/protocol";
import { AskRequestSchema } from "./schemas";
import { FALLBACK_BETA, type ModelMessage, type StreamParams } from "./anthropic";
import { checkRequest } from "./auth";
import { readJsonBody } from "./body";
import { LIMITS, type ServerEnv } from "./config";
import type { HandlerDeps } from "./deps";
import { classifyModelError, describeError } from "./errors";
import { jsonResponse, NDJSON_HEADERS } from "./http";
import { ASK_SYSTEM_PROMPT, transcriptForAsk } from "./prompts";

/** The last ten turns, starting with a question (the API requires the first message to be the user's). */
export function trimHistory(history: ChatTurn[]): ChatTurn[] {
  const recent = history.slice(-LIMITS.askHistoryTurns);
  const firstUser = recent.findIndex((turn) => turn.role === "user");
  return firstUser === -1 ? [] : recent.slice(firstUser);
}

/** The Messages API request for one question (PROMPT.md sections 6.6 and 7). */
export function buildAskParams(env: ServerEnv, request: AskRequest): StreamParams {
  return {
    model: env.askModel,
    max_tokens: LIMITS.maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: [
      { type: "text", text: ASK_SYSTEM_PROMPT },
      // The transcript is identical for every question about this document, so it is cached.
      { type: "text", text: transcriptForAsk(request.title, request.pages), cache_control: { type: "ephemeral" } },
    ],
    messages: [
      ...trimHistory(request.history).map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user" as const, content: request.question },
    ],
  };
}

function errorEvent(code: ErrorCode): AskEvent {
  return { type: "error", code, message: spokenError(code, "ask") };
}

/**
 * POST /api/ask. Answers a question about the document, streaming NDJSON events: `text` pieces
 * as they are written, then `done`, or `error` with a spoken message.
 */
export async function handleAsk(req: Request, deps: HandlerDeps): Promise<Response> {
  const started = deps.now();
  const elapsed = () => deps.now() - started;

  const denied = checkRequest(req, deps.env);
  if (denied) {
    deps.log({ route: "ask", outcome: "denied", code: String(denied.status), ms: elapsed() });
    return denied;
  }
  if (!deps.modelConfigured) {
    deps.log({ route: "ask", outcome: "error", code: "not_configured", ms: elapsed() });
    return jsonResponse(500, { error: "not_configured", message: spokenError("not_configured", "ask") });
  }
  const body = await readJsonBody(req, LIMITS.maxBodyBytes);
  if (!body.ok) {
    deps.log({ route: "ask", outcome: "rejected", code: body.error, ms: elapsed() });
    return jsonResponse(body.status, { error: body.error, message: spokenError(body.error, "ask") });
  }
  const parsed = AskRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    deps.log({ route: "ask", outcome: "rejected", code: "bad_request", ms: elapsed() });
    return jsonResponse(400, { error: "bad_request", message: spokenError("bad_request", "ask") });
  }
  const request = parsed.data;

  const abort = new AbortController();
  req.signal?.addEventListener("abort", () => abort.abort(), { once: true });
  const encoder = new TextEncoder();
  let firstEventMs: number | null = null;

  const run = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
    let open = true;
    const send = (event: AskEvent) => {
      if (!open) return;
      firstEventMs ??= elapsed();
      try {
        controller.enqueue(encoder.encode(toNdjsonLine(event)));
      } catch {
        open = false;
        abort.abort();
      }
    };
    let outcome = "ok";
    let code: string | undefined;
    let final: ModelMessage | undefined;
    let chars = 0;
    try {
      const stream = deps.client().stream(buildAskParams(deps.env, request), { signal: abort.signal });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
          chars += event.delta.text.length;
          send({ type: "text", text: event.delta.text });
        }
      }
      final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        outcome = "refusal";
        code = "refusal";
        send(errorEvent("refusal"));
      } else if (chars === 0) {
        outcome = "empty";
        code = "empty";
        send(errorEvent("empty"));
      } else {
        send({ type: "done" });
      }
    } catch (err) {
      const classified = classifyModelError(err);
      if (classified === "aborted" || abort.signal.aborted) {
        outcome = "aborted";
      } else {
        outcome = "error";
        code = classified;
        console.error(`ask: model call failed: ${describeError(err)}`);
        send(errorEvent(classified));
      }
    } finally {
      deps.log({
        route: "ask",
        outcome,
        code,
        model: final?.model ?? deps.env.askModel,
        ms: elapsed(),
        firstEventMs,
        stopReason: final?.stop_reason ?? null,
        inputTokens: final?.usage.input_tokens,
        outputTokens: final?.usage.output_tokens,
        cacheReadTokens: final?.usage.cache_read_input_tokens ?? null,
        cacheWriteTokens: final?.usage.cache_creation_input_tokens ?? null,
      });
      if (open) {
        open = false;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void run(controller);
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, { status: 200, headers: NDJSON_HEADERS });
}
