/** The model used for reading pages and answering questions unless overridden by environment. */
export const DEFAULT_MODEL = "claude-opus-5-5";

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
}

export function serverEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  return {
    passcode: env.APP_PASSCODE ? env.APP_PASSCODE : undefined,
    hasApiKey: Boolean(env.ANTHROPIC_API_KEY),
    readModel: env.READ_MODEL || DEFAULT_MODEL,
    askModel: env.ASK_MODEL || DEFAULT_MODEL,
    extraAllowedHosts: (env.ALLOWED_HOSTS ?? "")
      .split(",")
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  };
}
