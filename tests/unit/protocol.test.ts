import { describe, expect, it } from "vitest";
import { loadDoc, saveDoc } from "@/lib/client/document/model";
import { MemoryStorage } from "@/lib/client/storage";
import { AskRequestSchema, ReadRequestSchema } from "@/lib/server/schemas";
import { parseAskEvent, parseReadEvent } from "@/lib/shared/protocol";

describe("parseReadEvent", () => {
  it("accepts every valid event", () => {
    const meta = { type: "meta", status: "ok", language: "en", kind: "letter", title: "A letter" };
    expect(parseReadEvent(meta)).toEqual(meta);
    // Remarks about the photo are never carried to the phone.
    expect(parseReadEvent({ ...meta, warning: "Cut off." })).toEqual(meta);
    expect(parseReadEvent({ type: "block", kind: "note", text: "A picture." })).toEqual({ type: "block", kind: "note", text: "A picture." });
    expect(parseReadEvent({ type: "done", blocks: 3 })).toEqual({ type: "done", blocks: 3 });
    expect(parseReadEvent({ type: "page", number: 2 })).toEqual({ type: "page", number: 2 });
    expect(parseReadEvent({ type: "page", number: 1 })).toBeNull();
    expect(parseReadEvent({ type: "page" })).toBeNull();
    expect(parseReadEvent({ type: "error", code: "refusal", message: "No." })).toEqual({ type: "error", code: "refusal", message: "No." });
    expect(parseReadEvent({ type: "error", message: "No." })).toEqual({ type: "error", message: "No." });
  });

  it("rejects malformed and unknown events", () => {
    expect(parseReadEvent(null)).toBeNull();
    expect(parseReadEvent([])).toBeNull();
    expect(parseReadEvent({ type: "progress" })).toBeNull();
    expect(parseReadEvent({ type: "meta", status: "maybe", language: "en", kind: "", title: "" })).toBeNull();
    expect(parseReadEvent({ type: "meta", status: "ok", language: "e", kind: "", title: "" })).toBeNull();
    expect(parseReadEvent({ type: "block", kind: "title", text: "x" })).toBeNull();
    expect(parseReadEvent({ type: "block", kind: "paragraph", text: "" })).toBeNull();
    expect(parseReadEvent({ type: "done", blocks: -1 })).toBeNull();
    expect(parseReadEvent({ type: "error", code: "weird", message: "x" })).toBeNull();
    expect(parseReadEvent({ type: "error", message: "" })).toBeNull();
  });

  it("drops fields that are not part of the protocol", () => {
    expect(parseReadEvent({ type: "block", kind: "paragraph", text: "Hi.", extra: 1 })).toEqual({ type: "block", kind: "paragraph", text: "Hi." });
  });
});

describe("parseAskEvent", () => {
  it("accepts text, done, and error", () => {
    expect(parseAskEvent({ type: "text", text: "Yes." })).toEqual({ type: "text", text: "Yes." });
    expect(parseAskEvent({ type: "done" })).toEqual({ type: "done" });
    expect(parseAskEvent({ type: "error", code: "empty", message: "Nothing." })).toEqual({ type: "error", code: "empty", message: "Nothing." });
    expect(parseAskEvent({ type: "text", text: 3 })).toBeNull();
  });
});

describe("server request schemas", () => {
  it("validate read requests", () => {
    const ok = { image: { mediaType: "image/jpeg", data: "A".repeat(200) }, pageNumber: 1 };
    expect(ReadRequestSchema.safeParse(ok).success).toBe(true);
    expect(ReadRequestSchema.safeParse({ ...ok, pageNumber: 0 }).success).toBe(false);
    expect(ReadRequestSchema.safeParse({ ...ok, image: { ...ok.image, data: "not base64!" + "A".repeat(200) } }).success).toBe(false);
  });
  it("validate ask requests and trim the question", () => {
    const parsed = AskRequestSchema.safeParse({ pages: ["x"], title: "t", history: [], question: "  Why?  " });
    expect(parsed.success && parsed.data.question).toBe("Why?");
  });
});

describe("stored documents", () => {
  it("round-trip and reject corrupt data", () => {
    const storage = new MemoryStorage();
    saveDoc(storage, {
      id: "d",
      title: "T",
      language: "en",
      pages: [{ number: 1, language: "en", kind: "letter", title: "T", blocks: [{ kind: "paragraph", text: "Hi." }], complete: false }],
    });
    expect(loadDoc(storage)?.pages[0]).toMatchObject({ complete: true, blocks: [{ kind: "paragraph", text: "Hi." }] });
    storage.setItem("docreader.document.v1", JSON.stringify({ id: "d", title: "T", language: "en", pages: [{ number: "one" }] }));
    expect(loadDoc(storage)).toBeNull();
    storage.setItem("docreader.document.v1", "{broken");
    expect(loadDoc(storage)).toBeNull();
  });
});
