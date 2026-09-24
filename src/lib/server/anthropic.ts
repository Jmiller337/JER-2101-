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

/** The narrow client interface the route handlers depend on, so tests can pass a fake. */
export interface ModelClient {
  stream(params: StreamParams, options?: { signal?: AbortSignal }): ModelStream;
}

/**
 * The real client. `new Anthropic()` reads ANTHROPIC_API_KEY from the environment. The SDK
 * retries transient failures (429, 5xx, connection errors) twice by default.
 */
export function createAnthropicModelClient(): ModelClient {
  const client = new Anthropic({ timeout: LIMITS.modelTimeoutMs, maxRetries: 2 });
  return {
    stream: (params, options) => client.beta.messages.stream(params, options),
  };
}

/** Beta flag and parameter that retry a safety-classifier decline on a fallback model server-side. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
