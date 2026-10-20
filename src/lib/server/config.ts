import { parseTranslateFrom } from "@/lib/shared/translation";

/** The model used for reading pages and answering questions unless overridden by environment. */
export const DEFAULT_MODEL = "claude-opus-5-5";

/** How hard the model thinks before it writes (`output_config.effort`). */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** `fast` is the model's fast mode (a research preview: the same model, faster output). */
export type Speed = "fast" | "standard";

/**
 * Defaults chosen for a live demo, where speed and care matter more than cost: fast mode
 * (with a standard attempt behind it, see attempts.ts), high effort for reading a page, and
 * high effort for answering a question. MODEL_SPEED, READ_EFFORT, and ASK_EFFORT change them.
 */
export const DEFAULT_SPEED: Speed = "fast";
export const DEFAULT_READ_EFFORT: Effort = "high";
export const DEFAULT_ASK_EFFORT: Effort = "high";

/** How long a cached prompt lives between uses: the demo's reads and questions are all within an hour. */
export const CACHE_TTL = "1h" as const;

export const LIMITS = {
  /** Largest request body for questions (the phone sends well under 1.5 MB). */
  maxBodyBytes: 6 * 1024 * 1024,
  /** Largest body for a read: a PDF of up to 15 MB, as base64, plus a little JSON. */
  maxReadBodyBytes: 21 * 1024 * 1024,
  /** Upper bound on generated tokens for one page read or one answer. */
  maxTokens: 16000,
  /** A PDF can have many pages, all transcribed in one streamed answer. */
  maxPdfTokens: 64000,
  /** Request timeout for one model call. */
  modelTimeoutMs: 120_000,
  /** Question history sent to the model: the last ten turns. */
  askHistoryTurns: 10,
} as const;

export interface ServerEnv {
  /** The passcode the phone must present; undefined means the server is not configured. */
  passcode: string | undefined;
  /** Whether an Anthropic API key is present in the environment. */
  hasApiKey: boolean;
  readModel: string;
  askModel: string;
  /** Extra hostnames allowed in the Origin header, for custom domains behind a proxy. */
  extraAllowedHosts: string[];
  speed: Speed;
  readEffort: Effort;
  askEffort: Effort;
  /**
   * Languages whose documents are translated into English (TRANSLATE_FROM, for example "fr").
   * Empty, the default, switches translation off: the prompts are exactly as without it.
   */
  translateFrom: string[];
}

export function serverEnv(env: Record<string, string | undefined> = process.env): ServerEnv {
  return {
    passcode: env.APP_PASSCODE ? env.APP_PASSCODE : undefined,
    hasApiKey: Boolean(env.ANTHROPIC_API_KEY),
    readModel: env.READ_MODEL || DEFAULT_MODEL,
    askModel: env.ASK_MODEL || DEFAULT_MODEL,
    extraAllowedHosts: (env.ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
    translateFrom: parseTranslateFrom(env.TRANSLATE_FROM),
    speed: env.MODEL_SPEED?.trim().toLowerCase() === "standard" ? "standard" : DEFAULT_SPEED,
    readEffort: parseEffort(env.READ_EFFORT, DEFAULT_READ_EFFORT),
    askEffort: parseEffort(env.ASK_EFFORT, DEFAULT_ASK_EFFORT),
  };
}

function parseEffort(value: string | undefined, fallback: Effort): Effort {
  const effort = value?.trim().toLowerCase();
  return (EFFORTS as readonly string[]).includes(effort ?? "") ? (effort as Effort) : fallback;
}
