/**
 * Sends a page photo to the real Anthropic API through the read route handler and prints every
 * event with its arrival time, the time to the first block, token usage, and an estimated cost.
 *
 *   ANTHROPIC_API_KEY=... npm run check:real-api [path/to/photo.jpg]
 *
 * Costs a few cents per run. Uses READ_MODEL if set, otherwise the default model.
 */
import { readFileSync } from "node:fs";
import { createAnthropicModelClient } from "../src/lib/server/anthropic";
import { serverEnv } from "../src/lib/server/config";
import type { HandlerDeps } from "../src/lib/server/deps";
import type { RequestLog } from "../src/lib/server/log";
import { handleRead } from "../src/lib/server/readHandler";

const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5": { input: 2, output: 10 },
};

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY first. This check calls the real API and costs a few cents.");
    process.exit(2);
  }
  const file = process.argv[2] ?? "tests/fixtures/pages/letter-photo.jpg";
  const data = readFileSync(file).toString("base64");
  const mediaType = file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
  const logs: RequestLog[] = [];
  const env = { ...serverEnv(), passcode: "local-check" };
  const client = createAnthropicModelClient();
  const deps: HandlerDeps = { env, modelConfigured: true, client: () => client, log: (entry) => logs.push(entry), now: Date.now };

  const request = new Request("http://localhost/api/read", {
    method: "POST",
    headers: { authorization: "Bearer local-check", "content-type": "application/json" },
    body: JSON.stringify({ image: { mediaType, data }, pageNumber: 1, languageHint: null }),
  });

  console.log(`Reading ${file} with ${env.readModel} (${Math.round(data.length / 1024)} KB of base64)...\n`);
  const started = Date.now();
  const res = await handleRead(request, deps);
  if (!res.ok || !res.body) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let firstMeta: number | null = null;
  let firstBlock: number | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const ms = Date.now() - started;
      const event = JSON.parse(line) as { type: string; text?: string; title?: string; status?: string };
      if (event.type === "meta") firstMeta ??= ms;
      if (event.type === "block") firstBlock ??= ms;
      const detail = event.type === "block" ? event.text : event.type === "meta" ? `${event.status}: ${event.title}` : line;
      console.log(`${String(ms).padStart(6)} ms  ${event.type.padEnd(5)}  ${detail}`);
    }
  }
  const log = logs[0];
  console.log("\nSummary");
  console.log(`  time to meta (the title is spoken from here): ${firstMeta ?? "none"} ms`);
  console.log(`  time to first block: ${firstBlock ?? "none"} ms`);
  console.log(`  total: ${Date.now() - started} ms, outcome ${log?.outcome}, stop reason ${log?.stopReason}`);
  if (log?.inputTokens !== undefined) {
    const price = PRICES[env.readModel] ?? PRICES["claude-opus-5-5"]!;
    const cost = (log.inputTokens * price.input + (log.outputTokens ?? 0) * price.output) / 1_000_000;
    console.log(`  tokens: ${log.inputTokens} in, ${log.outputTokens} out; about $${cost.toFixed(4)}`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
