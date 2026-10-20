/**
 * Rehearses the demo against the real Anthropic API and checks the answers word for word
 * (docs/SETUP.md, "Before the demo"). It runs the same server code the phone talks to:
 *
 *   1. the test bill with "the amount due" asked first: the answer must give $84.12 and October 28
 *   2. the test bill with nothing asked: what it is, from whom, and the amount due
 *   3. "the account number" (printed on the bill): 40-2291-7
 *   4. "the late fee": $10.00
 *   5. two questions on the reading screen, the second served from the prompt cache
 *   6. the two-page test PDF, read to the end
 *
 * Every step prints the time to the first word and the speed the API used; a step that fails
 * prints why. Exit code 1 when anything failed. It also warms the prompt caches for an hour,
 * so run it less than an hour before the demo, on the same key the server uses.
 *
 *   ANTHROPIC_API_KEY=... npm run rehearse
 *
 * MODEL_SPEED, READ_EFFORT, ASK_EFFORT, and READ_MODEL / ASK_MODEL apply as on the server.
 * Costs under a dollar.
 */
import { readFileSync } from "node:fs";
import { createAnthropicModelClient } from "../src/lib/server/anthropic";
import { SpeedPolicy } from "../src/lib/server/attempts";
import { createFakeModelClient } from "../src/lib/server/fakeModel";
import { serverEnv } from "../src/lib/server/config";
import type { HandlerDeps } from "../src/lib/server/deps";
import type { RequestLog } from "../src/lib/server/log";
import { handleAsk } from "../src/lib/server/askHandler";
import { handleRead } from "../src/lib/server/readHandler";

const BILL = "tests/fixtures/pages/letter-photo.jpg";
const PDF = "tests/fixtures/pages/letter.pdf";

interface Outcome {
  name: string;
  ok: boolean;
  detail: string;
  firstWordMs: number | null;
  totalMs: number;
  log?: RequestLog;
}

const outcomes: Outcome[] = [];

function check(name: string, text: string, expected: RegExp[], timing: { firstWordMs: number | null; totalMs: number; log?: RequestLog }) {
  const missing = expected.filter((re) => !re.test(text));
  outcomes.push({
    name,
    ok: missing.length === 0 && text.trim() !== "",
    detail: missing.length ? `expected ${missing.map(String).join(", ")} in: "${text.trim()}"` : `"${text.trim()}"`,
    ...timing,
  });
}

async function main(): Promise<void> {
  const dryRun = process.env.FAKE_MODEL === "1";
  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error("Set ANTHROPIC_API_KEY first: this rehearsal calls the real API (under a dollar).");
    process.exit(2);
  }
  const env = { ...serverEnv(), passcode: "rehearsal" };
  const logs: RequestLog[] = [];
  const client = dryRun ? createFakeModelClient() : createAnthropicModelClient();
  const deps: HandlerDeps = {
    env,
    modelConfigured: true,
    client: () => client,
    log: (entry) => logs.push(entry),
    now: Date.now,
    speed: new SpeedPolicy(),
  };
  console.log(
    `${dryRun ? "Dry run with the scripted model. " : ""}Model ${env.readModel}, speed ${env.speed}, effort ${env.readEffort} (read) / ${env.askEffort} (ask).\n`,
  );

  const bill = readFileSync(BILL).toString("base64");
  const pdf = readFileSync(PDF).toString("base64");

  const read = async (body: object) => {
    const started = Date.now();
    const res = await handleRead(post("/api/read", body), deps);
    const events = await ndjson(res, started);
    const answer = events.find((e) => e.event.type === "answer");
    const meta = events.find((e) => e.event.type === "meta");
    return {
      answer: String(answer?.event.text ?? ""),
      title: String(meta?.event.title ?? ""),
      status: String(meta?.event.status ?? ""),
      text: events.filter((e) => e.event.type === "block").map((e) => String(e.event.text)).join("\n"),
      pages: 1 + events.filter((e) => e.event.type === "page").length,
      error: events.find((e) => e.event.type === "error")?.event.message as string | undefined,
      firstWordMs: answer?.ms ?? null,
      totalMs: Date.now() - started,
      log: logs[logs.length - 1],
    };
  };

  const image = { image: { mediaType: "image/jpeg", data: bill }, pageNumber: 1, languageHint: null };

  console.log("1. The bill, asking for the amount due first...");
  let r = await read({ ...image, question: "the amount due" });
  check("amount due asked before the photo", r.answer, [/84\.12/, /October 28/i], r);

  console.log("2. The bill with nothing asked...");
  r = await read(image);
  check("what it is, with no question", r.answer, [/Riverside Water/i, /84\.12/], r);
  const transcript = r.text;
  const title = r.title;
  // The whole page must follow the answer: Play reads it, and questions are answered from it.
  check("the page's text arrived after the answer", transcript, [/84\.12/, /555-0142/], {
    ...r,
    firstWordMs: null,
  });

  // The scripted model does not know these two facts: in a dry run it must say so.
  console.log("3. The account number...");
  r = await read({ ...image, question: "the account number" });
  check("account number", r.answer, dryRun ? [/^I can't find the account number/] : [/40-2291-7/], r);

  console.log("4. The late fee...");
  r = await read({ ...image, question: "the late fee" });
  check("late fee", r.answer, dryRun ? [/^I can't find the late fee/] : [/10\.00|ten dollars/i], r);

  console.log("5. Two questions on the reading screen...");
  const pages = [transcript];
  const history: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const [question, expected] of [
    ["who is it from", [/Riverside Water/i]],
    ["when is it due", [/October 28/i]],
  ] as const) {
    const started = Date.now();
    const res = await handleAsk(post("/api/ask", { pages, title, history, question }), deps);
    const events = await ndjson(res, started);
    const text = events.filter((e) => e.event.type === "text").map((e) => String(e.event.text)).join("");
    const first = events.find((e) => e.event.type === "text")?.ms ?? null;
    const log = logs[logs.length - 1];
    check(`ask: ${question}`, text, [...expected], { firstWordMs: first, totalMs: Date.now() - started, log });
    history.push({ role: "user", content: question }, { role: "assistant", content: text });
  }
  const second = outcomes[outcomes.length - 1]!.log;
  if (!dryRun && second && !(second.cacheReadTokens && second.cacheReadTokens > 0)) {
    outcomes.push({ name: "second question read the transcript from the cache", ok: false, detail: `cache reads: ${second.cacheReadTokens ?? 0}`, firstWordMs: null, totalMs: 0 });
  }

  console.log("6. The two-page PDF...");
  r = await read({ pdf: { data: pdf }, pageNumber: 1 });
  check("PDF read to the end", `${r.pages} pages\n${r.text}`, [/^2 pages/, /2\.40/], r);

  console.log("\nResults");
  let failed = 0;
  for (const o of outcomes) {
    if (!o.ok) failed += 1;
    const speed = o.log?.speed ? `, ${o.log.speed}` : "";
    const server =
      o.log && o.log.route === "read"
        ? `, server: ${o.log.blocks ?? 0} text lines, ${o.log.dropped ?? 0} dropped, ${o.log.parserMode}, stop ${o.log.stopReason}, ${o.log.outputTokens ?? "?"} out tokens`
        : "";
    const attempts = o.log && o.log.attempts && o.log.attempts > 1 ? `, ${o.log.attempts} attempts` : "";
    const cache = o.log?.cacheReadTokens ? `, cache read ${o.log.cacheReadTokens}` : "";
    const timing = o.firstWordMs !== null ? `first word ${o.firstWordMs} ms, total ${o.totalMs} ms` : `total ${o.totalMs} ms`;
    console.log(`  ${o.ok ? "PASS" : "FAIL"}  ${o.name}  (${timing}${speed}${attempts}${cache}${server})`);
    console.log(`        ${o.detail}`);
  }
  const slow = outcomes.filter((o) => o.firstWordMs !== null && o.firstWordMs > 8000);
  if (slow.length) console.log(`\n  Slow: ${slow.map((o) => o.name).join("; ")} took over 8 seconds to the first word.`);
  if (!deps.speed.fastAvailable) console.log("\n  Fast mode was refused by the API: the server will use standard speed.");
  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed. The prompt caches are warm for an hour.");
  process.exit(failed ? 1 : 0);
}

function post(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { authorization: "Bearer rehearsal", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function ndjson(res: Response, started: number): Promise<Array<{ ms: number; event: Record<string, unknown> }>> {
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const out: Array<{ ms: number; event: Record<string, unknown> }> = [];
  let buffer = "";
  const take = (line: string) => {
    if (line.trim()) out.push({ ms: Date.now() - started, event: JSON.parse(line) as Record<string, unknown> });
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    lines.forEach(take);
  }
  take(buffer);
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
