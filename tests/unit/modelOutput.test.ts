import { describe, expect, it } from "vitest";
import {
  DEFAULT_TITLE,
  DETECT_LIMIT_CHARS,
  ModelOutputParser,
  normalizeLanguage,
  parseJsonObjects,
  splitLongText,
} from "@/lib/server/modelOutput";
import { parseReadEvent, type ReadEvent } from "@/lib/shared/protocol";

const META = { type: "meta", status: "ok", language: "en", kind: "letter", title: "A letter from the bank" };
const B1 = { type: "block", kind: "heading", text: "First National Bank" };
const B2 = { type: "block", kind: "paragraph", text: "Dear customer, your statement is ready." };

function ndjson(...objects: unknown[]): string {
  return objects.map((o) => JSON.stringify(o)).join("\n") + "\n";
}

/** Feeds text in fixed-size chunks and returns every event, validating each against the protocol. */
function run(text: string, chunkSize = 7, hint: string | null = null): ReadEvent[] {
  const parser = new ModelOutputParser({ languageHint: hint });
  const events: ReadEvent[] = [];
  for (let i = 0; i < text.length; i += chunkSize) events.push(...parser.push(text.slice(i, i + chunkSize)));
  events.push(...parser.finish());
  for (const event of events) expect(parseReadEvent(event)).toEqual(event);
  return events;
}

describe("ModelOutputParser", () => {
  it("passes clean NDJSON through and writes its own done with the real count", () => {
    const events = run(ndjson(META, B1, B2, { type: "done", blocks: 99 }));
    expect(events.map((e) => e.type)).toEqual(["meta", "block", "block", "done"]);
    expect(events[3]).toEqual({ type: "done", blocks: 2 });
    expect(events[0]).toMatchObject({ status: "ok", title: "A letter from the bank", language: "en" });
  });

  it("emits the first block before the stream finishes", () => {
    const parser = new ModelOutputParser();
    const early = parser.push(ndjson(META, B1));
    expect(early.map((e) => e.type)).toEqual(["meta", "block"]);
  });

  it("strips code fences", () => {
    const events = run("```json\n" + ndjson(META, B1) + "```\n");
    expect(events.map((e) => e.type)).toEqual(["meta", "block", "done"]);
  });

  it("ignores prose before the meta line and between blocks", () => {
    const events = run("Here is the page:\n" + ndjson(META) + "Some chatter\n" + ndjson(B1));
    expect(events.map((e) => e.type)).toEqual(["meta", "block", "done"]);
  });

  it("synthesizes a meta line when the model starts with a block", () => {
    const events = run(ndjson(B1, B2), 5, "es");
    expect(events[0]).toMatchObject({ type: "meta", status: "ok", title: DEFAULT_TITLE, language: "es" });
    expect(events.filter((e) => e.type === "block")).toHaveLength(2);
  });

  it("repairs trailing commas and splits several objects on one line", () => {
    const text = `${JSON.stringify(META)},\n{"type":"block","kind":"paragraph","text":"One.",}\n${JSON.stringify(B1)}${JSON.stringify(B2)}\n`;
    const events = run(text);
    expect(events.filter((e) => e.type === "block").map((e) => (e as { text: string }).text)).toEqual([
      "One.",
      "First National Bank",
      "Dear customer, your statement is ready.",
    ]);
  });

  it("drops invalid lines and blocks without text but keeps going", () => {
    const text = ndjson(META) + "{not json\n" + ndjson({ type: "block", kind: "paragraph", text: "  " }, B1);
    const parser = new ModelOutputParser();
    const events = [...parser.push(text), ...parser.finish()];
    expect(events.map((e) => e.type)).toEqual(["meta", "block", "done"]);
    expect(parser.stats.dropped).toBe(2);
  });

  it("maps an unknown block kind to paragraph and collapses whitespace", () => {
    const events = run(ndjson(META, { type: "block", kind: "title", text: "Hello \n  world" }));
    expect(events[1]).toEqual({ type: "block", kind: "paragraph", text: "Hello world" });
  });

  it("falls back to plain text when no meta appears within the limit", () => {
    const para = "This is ordinary prose from the model with no JSON at all. ".repeat(6);
    const text = `# Notice\n\n${para}\n${para}\n\n- first point\n- second point\n\n${para}`;
    expect(text.length).toBeGreaterThan(DETECT_LIMIT_CHARS);
    const events = run(text, 40);
    expect(events[0]).toMatchObject({ type: "meta", status: "ok", title: DEFAULT_TITLE });
    const blocks = events.filter((e) => e.type === "block") as Array<{ kind: string; text: string }>;
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "paragraph", "list_item", "list_item", "paragraph"]);
    expect(blocks[0]!.text).toBe("Notice");
    expect(events[events.length - 1]).toMatchObject({ type: "done", blocks: 5 });
  });

  it("switches to plain text as soon as the limit is passed, before the stream ends", () => {
    const parser = new ModelOutputParser();
    const events = parser.push("Plain words. ".repeat(60) + "\n\nMore words.\n");
    expect(events[0]).toMatchObject({ type: "meta" });
    expect(events.some((e) => e.type === "block")).toBe(true);
  });

  it("converts short plain-text output at the end", () => {
    const events = run("Just a short note.\n");
    expect(events.map((e) => e.type)).toEqual(["meta", "block", "done"]);
  });

  it("does not give up on a long meta line that is still arriving", () => {
    const longTitle = "A very long title ".repeat(30).trim();
    const meta = { ...META, title: longTitle.slice(0, 400) };
    const events = run(ndjson(meta, B1), 3);
    expect(events[0]).toMatchObject({ type: "meta", kind: "letter" });
    expect(events.map((e) => e.type)).toEqual(["meta", "block", "done"]);
  });

  it("passes a retry meta through and ignores any blocks after it", () => {
    const retry = { type: "meta", status: "retry", language: "en", kind: "other", title: "", problem: "Too dark." };
    const events = run(ndjson(retry, B1));
    expect(events).toEqual([
      { type: "meta", status: "retry", language: "en", kind: "other", title: "", problem: "Too dark." },
      { type: "done", blocks: 0 },
    ]);
  });

  it("gives a retry without a problem a default spoken reason", () => {
    const events = run(ndjson({ type: "meta", status: "retry" }));
    expect(events[0]).toMatchObject({ status: "retry", problem: expect.stringContaining("try again") });
  });

  it("reports an empty result as an error", () => {
    expect(run("")).toEqual([expect.objectContaining({ type: "error", code: "empty" })]);
    expect(run("```\n```\n")).toEqual([expect.objectContaining({ type: "error", code: "empty" })]);
  });

  it("fails with a spoken refusal message and ignores later calls", () => {
    const parser = new ModelOutputParser();
    parser.push(ndjson(META));
    const events = parser.fail("refusal");
    expect(events).toEqual([
      { type: "error", code: "refusal", message: "I couldn't read this page. Try again or try another page." },
    ]);
    expect(parser.finish()).toEqual([]);
    expect(parser.push("more")).toEqual([]);
  });

  it("normalizes language tags", () => {
    expect(normalizeLanguage("en_US")).toBe("en-US");
    expect(normalizeLanguage("zh-Hant-TW")).toBe("zh-Hant-TW");
    expect(normalizeLanguage("English")).toBeNull();
    expect(normalizeLanguage(3)).toBeNull();
    const events = run(ndjson({ ...META, language: "English" }), 50, "fr");
    expect(events[0]).toMatchObject({ language: "fr" });
  });

  it("splits a block longer than the protocol limit without dropping words", () => {
    const long = "word ".repeat(2500).trim();
    const events = run(ndjson(META, { type: "block", kind: "paragraph", text: long }), 500);
    const blocks = events.filter((e) => e.type === "block") as Array<{ text: string }>;
    expect(blocks.length).toBe(2);
    expect(blocks.map((b) => b.text).join(" ")).toBe(long);
  });
});

describe("parseJsonObjects", () => {
  it("returns nothing for non-JSON lines", () => {
    expect(parseJsonObjects("hello")).toEqual([]);
    expect(parseJsonObjects("{broken")).toEqual([]);
  });
  it("parses one object", () => {
    expect(parseJsonObjects('{"a":1}')).toEqual([{ a: 1 }]);
  });
});

describe("splitLongText", () => {
  it("leaves short text alone", () => {
    expect(splitLongText("abc", 10)).toEqual(["abc"]);
  });
  it("splits at spaces", () => {
    expect(splitLongText("aaa bbb ccc", 7)).toEqual(["aaa bbb", "ccc"]);
  });
});
