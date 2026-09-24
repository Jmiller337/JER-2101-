import { createAnthropicModelClient, type ModelClient } from "./anthropic";
import { serverEnv, type ServerEnv } from "./config";
import { createFakeModelClient } from "./fakeModel";
import { logRequest, type RequestLog } from "./log";

export interface HandlerDeps {
  env: ServerEnv;
  /** Whether a model is available (a real API key, or the scripted fake model). */
  modelConfigured: boolean;
  client: () => ModelClient;
  log: (entry: RequestLog) => void;
  now: () => number;
}

let cachedClient: ModelClient | null = null;
let warnedAboutFake = false;

/**
 * Whether to use the scripted test model. FAKE_MODEL=1 is honoured only off the hosting
 * platforms: on Vercel or Fly.io it is ignored (with an error in the log), so a stray variable
 * can never make a real deployment read out invented text.
 */
export function fakeModelEnabled(vars: Record<string, string | undefined> = process.env): boolean {
  if (vars.FAKE_MODEL !== "1") return false;
  const hosted = Boolean(vars.VERCEL || vars.FLY_APP_NAME);
  if (!warnedAboutFake) {
    warnedAboutFake = true;
    if (hosted) console.error("FAKE_MODEL=1 is ignored on a hosted deployment; using the Anthropic API.");
    else console.warn("FAKE_MODEL=1: using the scripted test model instead of the Anthropic API.");
  }
  return !hosted;
}

/**
 * Dependencies for the real routes. FAKE_MODEL=1 swaps the Anthropic API for a scripted model
 * so end-to-end tests exercise the real server and streaming path without a key.
 */
export function defaultDeps(): HandlerDeps {
  const env = serverEnv();
  const fake = fakeModelEnabled();
  return {
    env,
    modelConfigured: fake || env.hasApiKey,
    client: () => {
      if (fake) return createFakeModelClient();
      cachedClient ??= createAnthropicModelClient();
      return cachedClient;
    },
    log: logRequest,
    now: Date.now,
  };
}
