import type { ModelMessage, ModelStream } from "./anthropic";
import type { Speed } from "./config";
import { classifyModelError, type ModelErrorClass } from "./errors";

/** One try at a model call: which speed to ask for, and how often the SDK may retry it quietly. */
export interface Attempt {
  speed: Speed;
  maxRetries: number;
}

/**
 * Which speeds to try for one request, in order (docs/SETUP.md, "Before the demo").
 *
 * Fast mode is a research preview with its own rate limits, so it is never relied on alone:
 * when it is wanted, the first attempt asks for it with no quiet retries, and a failure before
 * any text has reached the phone moves straight on to a standard attempt (with the SDK's own
 * retries for a busy service), then one last plain attempt. If the API refuses fast mode as a
 * request it does not accept (a 400: the preview is not switched on for this key), fast mode
 * is set aside for the rest of the process so no later request pays for that round trip.
 */
export class SpeedPolicy {
  private fastRejected = false;

  attempts(wanted: Speed): Attempt[] {
    const standard: Attempt[] = [
      { speed: "standard", maxRetries: 2 },
      { speed: "standard", maxRetries: 0 },
    ];
    if (wanted !== "fast" || this.fastRejected) return standard;
    return [{ speed: "fast", maxRetries: 0 }, ...standard];
  }

  /** Whether fast mode is still being asked for. */
  get fastAvailable(): boolean {
    return !this.fastRejected;
  }

  /** A fast attempt failed before any text arrived. */
  fastFailed(code: ModelErrorClass): void {
    if (code === "bad_request") this.fastRejected = true;
  }
}

/** Whether a failure before any output is worth another attempt. */
export function retryable(code: ModelErrorClass, attempt: Attempt): boolean {
  switch (code) {
    case "aborted":
    case "not_configured":
    case "too_large":
      return false;
    case "bad_request":
      // The request itself is wrong, unless it was only wrong for asking for fast mode.
      return attempt.speed === "fast";
    default:
      return true;
  }
}

export interface AttemptResult {
  final: ModelMessage;
  attempt: Attempt;
  /** How many attempts were made, including the one that succeeded. */
  attempts: number;
}

/**
 * Runs the model call attempt by attempt until one produces output. An attempt that fails
 * before anything has reached the phone (`committed` is false) is abandoned for the next one;
 * once the phone has heard something there is no going back, and the error is thrown for the
 * caller to report. Throws the last error when every attempt fails.
 */
export async function streamWithAttempts(opts: {
  attempts: Attempt[];
  policy: SpeedPolicy;
  start(attempt: Attempt): ModelStream;
  /** Called before each attempt, so the caller can start from a clean parser. */
  begin(attempt: Attempt, index: number): void;
  onText(text: string): void;
  committed(): boolean;
  aborted(): boolean;
}): Promise<AttemptResult> {
  const { attempts } = opts;
  for (let index = 0; index < attempts.length; index++) {
    const attempt = attempts[index]!;
    opts.begin(attempt, index);
    try {
      const stream = opts.start(attempt);
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") opts.onText(event.delta.text);
      }
      const final = await stream.finalMessage();
      return { final, attempt, attempts: index + 1 };
    } catch (err) {
      const code = classifyModelError(err);
      if (attempt.speed === "fast") opts.policy.fastFailed(code);
      const last = index === attempts.length - 1;
      if (last || opts.committed() || opts.aborted() || !retryable(code, attempt)) throw err;
      console.warn(`model: ${attempt.speed} attempt ${index + 1} failed before any output (${code}); trying again`);
    }
  }
  throw new Error("no attempts");
}
