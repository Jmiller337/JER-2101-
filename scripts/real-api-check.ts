/**
 * Sends a page photo to the real Anthropic API through the read route handler and prints every
 * event with its arrival time, the time to the first block, token usage, and an estimated cost.
 * Then asks two questions about the page through the ask handler; the second should read the
 * transcript from the prompt cache (if the page is long enough to be cached).
 *
 *   ANTHROPIC_API_KEY=... npm run check:real-api [path/to/photo.jpg or path/to/file.pdf]
 *
 * A PDF (for example tests/fixtures/pages/letter.pdf) is sent the way "Open a PDF" sends it,
 * and each page break is printed as a "page" line.
 *
 * Costs a few cents per run. Uses READ_MODEL and ASK_MODEL if set, otherwise the default model.
 */
import { readFileSync } from "node:fs";
import { createAnthropicModelClient } from "../src/lib/server/anthropic";
import { createFakeModelClient } from "../src/lib/server/fakeModel";
import { serverEnv } from "../src/lib/server/config";
import type { HandlerDeps } from "../src/lib/server/deps";
import type { RequestLog } from "../src/lib/server/log";
import { handleAsk } from "../src/lib/server/askHandler";
import { handleRead } from "../src/lib/server/readHandler";

const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5": { input: 2, output: 10 },
};

async function main(): Promise<void> {
  const dryRun = process.env.FAKE_MODEL === "1";
  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY first. This check calls the real API and costs a few cents.");
    console.error("(FAKE_MODEL=1 runs the same script against the scripted test model, for free.)");
    process.exit(2);
  }
  const file = process.argv[2] ?? "tests/fixtures/pages/letter-photo.jpg";
  const data = readFileSync(file).toString("base64");
  const isPdf = file.toLowerCase().endsWith(".pdf");
  const mediaType = file.endsWith(".png") ? "image/png" : file.endsWith(".webp") ? "image/webp" : "image/jpeg";
  const source = isPdf ? { pdf: { data } } : { image: { mediaType, data } };
  const logs: RequestLog[] = [];
  const env = { ...serverEnv(), passcode: "local-check" };
  const client = dryRun ? createFakeModelClient() : createAnthropicModelClient();
  if (dryRun) console.log("Dry run with the scripted test model (FAKE_MODEL=1); no API calls are made.");
  const deps: HandlerDeps = { env, modelConfigured: true, client: () => client, log: (entry) => logs.push(entry), now: Date.now };

  const request = new Request("http://localhost/api/read", {
    method: "POST",
    headers: { authorization: "Bearer local-check", "content-type": "application/json" },
    body: JSON.stringify({ ...source, pageNumber: 1, languageHint: null }),
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
  let title = "";
  const blocks: string[] = [];
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
      if (event.type === "meta") {
        firstMeta ??= ms;
        title = event.title ?? "";
      }
      if (event.type === "block") {
        firstBlock ??= ms;
        blocks.push(event.text ?? "");
      }
      const detail =
        event.type === "block" ? event.text : event.type === "meta" ? `${event.status}: ${event.title}` : line;
      if (event.type === "page") blocks.push("");
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

  if (blocks.length === 0 || isPdf) return;
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const question of ["How much do I owe, and when is it due?", "What phone number can I call?"]) {
    const askLogs: RequestLog[] = [];
    const askDeps: HandlerDeps = { ...deps, log: (entry) => askLogs.push(entry) };
    const askStarted = Date.now();
    const askRes = await handleAsk(
      new Request("http://localhost/api/ask", {
        method: "POST",
        headers: { authorization: "Bearer local-check", "content-type": "application/json" },
        body: JSON.stringify({ pages: [blocks.join("\n")], title, history, question }),
      }),
      askDeps,
    );
    const text = (await askRes.text())
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as { type: string; text?: string; message?: string })
      .map((event) => (event.type === "text" ? event.text : event.type === "error" ? `[error] ${event.message}` : ""))
      .join("");
    const askLog = askLogs[0];
    console.log(`\nQ: ${question}\nA: ${text}`);
    console.log(
      `  ${Date.now() - askStarted} ms; first text at ${askLog?.firstEventMs} ms; tokens ${askLog?.inputTokens} in (cache read ${askLog?.cacheReadTokens}, cache write ${askLog?.cacheWriteTokens}), ${askLog?.outputTokens} out`,
    );
    history.push({ role: "user", content: question }, { role: "assistant", content: text });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
