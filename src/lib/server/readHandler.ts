import { toNdjsonLine } from "@/lib/shared/ndjson";
import { spokenError } from "@/lib/shared/messages";
import type { ReadEvent, ReadRequest } from "@/lib/shared/protocol";
import { ReadRequestSchema } from "./schemas";
import { FALLBACK_BETA, type ModelMessage, type StreamParams } from "./anthropic";
import { checkRequest } from "./auth";
import { readJsonBody } from "./body";
import { LIMITS, type ServerEnv } from "./config";
import type { HandlerDeps } from "./deps";
import { classifyModelError, describeError } from "./errors";
import { jsonResponse, NDJSON_HEADERS } from "./http";
import { ModelOutputParser } from "./modelOutput";
import { READ_PDF_SYSTEM_PROMPT, READ_SYSTEM_PROMPT, readPdfUserText, readUserText } from "./prompts";

/** The Messages API request for reading one page or one PDF (PROMPT.md sections 6.5 and 7). */
export function buildReadParams(env: ServerEnv, request: ReadRequest): StreamParams {
  const common = {
    model: env.readModel,
    betas: [FALLBACK_BETA],
    fallbacks: "default" as const,
    // Full effort: a page must be transcribed to the last line. Lower settings shorten the
    // output, which for a transcription means words left out.
    output_config: { effort: "high" as const },
  };
  if (request.pdf) {
    return {
      ...common,
      max_tokens: LIMITS.maxPdfTokens,
      system: READ_PDF_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            // The document first, then the instruction.
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: request.pdf.data } },
            { type: "text", text: readPdfUserText(request.languageHint) },
          ],
        },
      ],
    };
  }
  const image = request.image!;
  return {
    ...common,
    max_tokens: LIMITS.maxTokens,
    system: READ_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          // Image first, then the instruction.
          { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
          { type: "text", text: readUserText(request.pageNumber, request.languageHint) },
        ],
      },
    ],
  };
}

/**
 * POST /api/read. Validates the passcode and body, calls the model with streaming, and streams
 * validated NDJSON events back as they are produced. Always ends the stream with exactly one
 * `done` or `error` event (unless the phone disconnected).
 */
export async function handleRead(req: Request, deps: HandlerDeps): Promise<Response> {
  const started = deps.now();
  const elapsed = () => deps.now() - started;

  const denied = checkRequest(req, deps.env);
  if (denied) {
    deps.log({ route: "read", outcome: "denied", code: String(denied.status), ms: elapsed() });
    return denied;
  }
  if (!deps.modelConfigured) {
    deps.log({ route: "read", outcome: "error", code: "not_configured", ms: elapsed() });
    return jsonResponse(500, { error: "not_configured", message: spokenError("not_configured") });
  }
  const body = await readJsonBody(req, LIMITS.maxReadBodyBytes);
  if (!body.ok) {
    deps.log({ route: "read", outcome: "rejected", code: body.error, ms: elapsed() });
    return jsonResponse(body.status, { error: body.error, message: spokenError(body.error) });
  }
  const parsed = ReadRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    deps.log({ route: "read", outcome: "rejected", code: "bad_request", ms: elapsed() });
    return jsonResponse(400, { error: "bad_request", message: spokenError("bad_request") });
  }
  const request = parsed.data;

  const abort = new AbortController();
  req.signal?.addEventListener("abort", () => abort.abort(), { once: true });
  const parser = new ModelOutputParser({
    languageHint: request.languageHint,
    firstPage: request.pageNumber,
    multiPage: Boolean(request.pdf),
  });
  const encoder = new TextEncoder();
  let firstEventMs: number | null = null;

  const run = async (controller: ReadableStreamDefaultController<Uint8Array>) => {
    let open = true;
    const send = (events: ReadEvent[]) => {
      for (const event of events) {
        if (!open) return;
        firstEventMs ??= elapsed();
        try {
          controller.enqueue(encoder.encode(toNdjsonLine(event)));
        } catch {
          open = false; // the phone went away
          abort.abort();
        }
      }
    };

    let outcome = "ok";
    let code: string | undefined;
    let final: ModelMessage | undefined;
    try {
      const stream = deps.client().stream(buildReadParams(deps.env, request), { signal: abort.signal });
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          send(parser.push(event.delta.text));
        }
      }
      final = await stream.finalMessage();
      if (final.stop_reason === "refusal") {
        // Every model in the fallback chain declined. Partial text already sent stays sent;
        // the phone announces the error and stops treating the page as complete.
        outcome = "refusal";
        code = "refusal";
        send(parser.fail("refusal"));
      } else {
        send(parser.finish());
        const status = parser.stats.metaStatus;
        outcome = status === "retry" ? "retry" : status === "ok" ? "ok" : "empty";
      }
    } catch (err) {
      const classified = classifyModelError(err);
      if (classified === "aborted" || abort.signal.aborted) {
        outcome = "aborted";
      } else {
        outcome = "error";
        code = classified;
        console.error(`read: model call failed: ${describeError(err)}`);
        send(parser.fail(classified));
      }
    } finally {
      const stats = parser.stats;
      deps.log({
        route: "read",
        outcome,
        code,
        model: final?.model ?? deps.env.readModel,
        ms: elapsed(),
        firstEventMs,
        stopReason: final?.stop_reason ?? null,
        inputTokens: final?.usage.input_tokens,
        outputTokens: final?.usage.output_tokens,
        cacheReadTokens: final?.usage.cache_read_input_tokens ?? null,
        blocks: stats.blocks,
        dropped: stats.dropped,
        parserMode: stats.mode,
        imageChars: request.image?.data.length,
        pdfChars: request.pdf?.data.length,
        pages: stats.pages,
      });
      if (open) {
        open = false;
        try {
          controller.close();
        } catch {
          // already closed by a cancel
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
