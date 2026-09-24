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
 * Dependencies for the real routes. FAKE_MODEL=1 swaps the Anthropic API for a scripted model
 * so end-to-end tests exercise the real server and streaming path without a key. It must never
 * be set on a real deployment.
 */
export function defaultDeps(): HandlerDeps {
  const env = serverEnv();
  const fake = process.env.FAKE_MODEL === "1";
  if (fake && !warnedAboutFake) {
    warnedAboutFake = true;
    console.warn("FAKE_MODEL=1: using the scripted test model instead of the Anthropic API.");
  }
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
