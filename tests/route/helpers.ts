import type { ModelClient, StreamParams } from "@/lib/server/anthropic";
import type { ServerEnv } from "@/lib/server/config";
import type { HandlerDeps } from "@/lib/server/deps";
import { FakeModelStream, type FakeScript } from "@/lib/server/fakeModel";
import type { RequestLog } from "@/lib/server/log";

export const PASSCODE = "test-passcode";

export const TEST_ENV: ServerEnv = {
  passcode: PASSCODE,
  hasApiKey: true,
  readModel: "claude-opus-5-5",
  askModel: "claude-opus-5-5",
  extraAllowedHosts: [],
};

/** A small valid base64 payload (the handler never decodes it; the fake model ignores it). */
export const IMAGE_DATA = "A".repeat(400);

export interface TestDeps extends HandlerDeps {
  logs: RequestLog[];
  calls: StreamParams[];
}

export function makeDeps(script: FakeScript | (() => FakeScript), overrides: Partial<HandlerDeps> = {}): TestDeps {
  const logs: RequestLog[] = [];
  const calls: StreamParams[] = [];
  const client: ModelClient = {
    stream(params, options) {
      calls.push(params);
      return new FakeModelStream(typeof script === "function" ? script() : script, options?.signal);
    },
  };
  return {
    env: TEST_ENV,
    modelConfigured: true,
    client: () => client,
    log: (entry) => logs.push(entry),
    now: Date.now,
    ...overrides,
    logs,
    calls,
  };
}

export function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://app.test${path}`, {
    method: "POST",
    headers: {
      host: "app.test",
      origin: "http://app.test",
      "content-type": "application/json",
      authorization: `Bearer ${PASSCODE}`,
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Reads an NDJSON response body into parsed objects. */
export async function readNdjson(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function ndjson(...objects: unknown[]): string {
  return objects.map((o) => JSON.stringify(o)).join("\n") + "\n";
}
