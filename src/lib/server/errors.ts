import Anthropic from "@anthropic-ai/sdk";
import type { ErrorCode } from "@/lib/shared/protocol";

export type ModelErrorClass = ErrorCode | "aborted";

/** Maps an error thrown by the SDK (or by a stream) to one of the protocol error codes. */
export function classifyModelError(err: unknown): ModelErrorClass {
  // Most specific first: every class below extends Anthropic.APIError.
  if (err instanceof Anthropic.APIUserAbortError) return "aborted";
  if (err instanceof Anthropic.AuthenticationError) return "not_configured";
  if (err instanceof Anthropic.PermissionDeniedError) return "not_configured";
  if (err instanceof Anthropic.NotFoundError) return "not_configured";
  if (err instanceof Anthropic.RateLimitError) return "rate_limited";
  if (err instanceof Anthropic.BadRequestError) return "bad_request";
  if (err instanceof Anthropic.UnprocessableEntityError) return "bad_request";
  if (err instanceof Anthropic.APIConnectionError) return "server";
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529) return "overloaded";
    if (err.status === 413) return "too_large";
    // Errors that arrive inside an already-open stream carry no HTTP status, only a type.
    const type = errorType(err.error);
    if (type === "overloaded_error") return "overloaded";
    if (type === "rate_limit_error") return "rate_limited";
    if (type === "invalid_request_error") return "bad_request";
    return "server";
  }
  if (err instanceof Error && err.name === "AbortError") return "aborted";
  return "server";
}

function errorType(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const inner = (body as { error?: unknown }).error;
  if (typeof inner === "object" && inner !== null) {
    const type = (inner as { type?: unknown }).type;
    return typeof type === "string" ? type : undefined;
  }
  const type = (body as { type?: unknown }).type;
  return typeof type === "string" ? type : undefined;
}

/** A short technical description for server logs. Never includes document text. */
export function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) {
    return `${err.constructor.name} status=${err.status ?? "none"} request_id=${err.requestID ?? "none"}`;
  }
  if (err instanceof Error) return `${err.name}: ${err.message.slice(0, 200)}`;
  return "unknown error";
}
