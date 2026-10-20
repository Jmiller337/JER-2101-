import Anthropic from "@anthropic-ai/sdk";
import { LIMITS } from "./config";

export type StreamParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];
export type ModelMessage = Anthropic.Beta.Messages.BetaMessage;
export type ModelStreamEvent = Anthropic.Beta.Messages.BetaRawMessageStreamEvent;

/** The part of a streaming response the handlers use. `BetaMessageStream` satisfies it. */
export interface ModelStream extends AsyncIterable<ModelStreamEvent> {
  finalMessage(): Promise<ModelMessage>;
  abort(): void;
}

export interface StreamOptions {
  signal?: AbortSignal;
  /** How often the SDK may quietly retry a failed request (429, 5xx, a dropped connection). */
  maxRetries?: number;
}

/** The narrow client interface the route handlers depend on, so tests can pass a fake. */
export interface ModelClient {
  stream(params: StreamParams, options?: StreamOptions): ModelStream;
}

/**
 * The real client. `new Anthropic()` reads ANTHROPIC_API_KEY from the environment. The SDK
 * retries transient failures (429, 5xx, connection errors) before a stream opens; each attempt
 * says how many times (see attempts.ts).
 */
export function createAnthropicModelClient(): ModelClient {
  const client = new Anthropic({ timeout: LIMITS.modelTimeoutMs, maxRetries: 2 });
  return {
    stream: (params, options) => client.beta.messages.stream(params, { signal: options?.signal, maxRetries: options?.maxRetries }),
  };
}

/** Beta flag and parameter that retry a safety-classifier decline on a fallback model server-side. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
/** Beta flag for fast mode (`speed: "fast"`): the same model with faster output. */
export const FAST_MODE_BETA = "fast-mode-2026-02-01";
