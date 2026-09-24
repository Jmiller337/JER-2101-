import { LineSplitter } from "@/lib/shared/ndjson";
import {
  parseAskEvent,
  parseReadEvent,
  type AskEvent,
  type AskRequest,
  type ErrorCode,
  type ReadEvent,
  type ReadRequest,
} from "@/lib/shared/protocol";

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

export function isAbortError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === "AbortError";
}

export interface ApiClient {
  /** Resolves when the server accepts the passcode; throws ApiError otherwise. */
  checkPasscode(passcode: string): Promise<void>;
  /** Streams one page read. Throws ApiError if the request fails or the stream is cut off. */
  readPage(body: ReadRequest, passcode: string, onEvent: (event: ReadEvent) => void, signal?: AbortSignal): Promise<void>;
  /** Streams one answer. Throws ApiError if the request fails or the stream is cut off. */
  ask(body: AskRequest, passcode: string, onEvent: (event: AskEvent) => void, signal?: AbortSignal): Promise<void>;
}

export function createApiClient(opts: { fetch?: typeof fetch; retryDelayMs?: number } = {}): ApiClient {
  const fetchImpl = opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const retryDelayMs = opts.retryDelayMs ?? 800;

  async function post(path: string, body: unknown, passcode: string, signal?: AbortSignal): Promise<Response> {
    const attempt = () =>
      fetchImpl(path, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${passcode}` },
        body: JSON.stringify(body),
        cache: "no-store",
        signal,
      });
    let res: Response;
    try {
      res = await attempt();
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) throw err;
      // One automatic retry for a network failure before any response (PROMPT.md 6.11).
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        res = await attempt();
      } catch (err2) {
        if (signal?.aborted || isAbortError(err2)) throw err2;
        throw new ApiError("network");
      }
    }
    if (!res.ok) throw new ApiError(await errorCodeFor(res));
    return res;
  }

  async function stream<T extends { type: string }>(
    res: Response,
    parse: (value: unknown) => T | null,
    onEvent: (event: T) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const reader = res.body?.getReader();
    if (!reader) throw new ApiError("network");
    const decoder = new TextDecoder();
    const splitter = new LineSplitter();
    let finished = false;
    const handle = (line: string) => {
      if (!line.trim()) return;
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        return;
      }
      const event = parse(value);
      if (!event) return; // unknown or malformed events are ignored
      if (event.type === "done" || event.type === "error") finished = true;
      onEvent(event);
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of splitter.push(decoder.decode(value, { stream: true }))) handle(line);
      }
      for (const line of splitter.push(decoder.decode())) handle(line);
      for (const line of splitter.flush()) handle(line);
    } catch (err) {
      if (signal?.aborted || isAbortError(err)) throw err;
      throw new ApiError("network");
    }
    if (!finished) throw new ApiError("network"); // the connection dropped mid-stream
  }

  return {
    async checkPasscode(passcode) {
      await post("/api/auth", {}, passcode);
    },
    async readPage(body, passcode, onEvent, signal) {
      const res = await post("/api/read", body, passcode, signal);
      await stream(res, parseReadEvent, onEvent, signal);
    },
    async ask(body, passcode, onEvent, signal) {
      const res = await post("/api/ask", body, passcode, signal);
      await stream(res, parseAskEvent, onEvent, signal);
    },
  };
}

async function errorCodeFor(res: Response): Promise<ErrorCode> {
  switch (res.status) {
    case 400:
      return "bad_request";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 413:
      return "too_large";
    case 429:
      return "rate_limited";
    default:
      break;
  }
  try {
    const body = (await res.json()) as { error?: string };
    if (body.error === "not_configured") return "not_configured";
  } catch {
    // not JSON
  }
  return "server";
}
