import { describe, expect, it } from "vitest";
import { LineSplitter, toNdjsonLine } from "@/lib/shared/ndjson";

describe("LineSplitter", () => {
  it("returns only complete lines and keeps the tail", () => {
    const s = new LineSplitter();
    expect(s.push('{"a":1}\n{"b"')).toEqual(['{"a":1}']);
    expect(s.pending).toBe('{"b"');
    expect(s.push(":2}\n")).toEqual(['{"b":2}']);
    expect(s.flush()).toEqual([]);
  });

  it("handles CRLF split across chunks", () => {
    const s = new LineSplitter();
    expect(s.push("one\r")).toEqual([]);
    expect(s.push("\ntwo\r\n")).toEqual(["one", "two"]);
  });

  it("flushes an unterminated final line", () => {
    const s = new LineSplitter();
    s.push("last line");
    expect(s.flush()).toEqual(["last line"]);
    expect(s.flush()).toEqual([]);
  });

  it("keeps empty lines between content", () => {
    const s = new LineSplitter();
    expect(s.push("a\n\nb\n")).toEqual(["a", "", "b"]);
  });

  it("serializes events as single lines", () => {
    expect(toNdjsonLine({ type: "done", blocks: 2 })).toBe('{"type":"done","blocks":2}\n');
  });
});
