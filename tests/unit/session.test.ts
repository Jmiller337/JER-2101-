import { describe, expect, it, vi } from "vitest";
import { ApiError, type ApiClient } from "@/lib/client/api";
import type { PreparedImage } from "@/lib/client/camera/prepare";
import { loadDoc } from "@/lib/client/document/model";
import { DocumentSession, type PageReadCallbacks } from "@/lib/client/document/session";
import { MemoryStorage } from "@/lib/client/storage";
import type { ReadEvent } from "@/lib/shared/protocol";

const IMAGE: PreparedImage = {
  base64: "AAAA",
  mediaType: "image/jpeg",
  width: 10,
  height: 10,
  bytes: 3,
  blob: new Blob(["jpeg"], { type: "image/jpeg" }),
};

function api(events: ReadEvent[], opts: { throwAfter?: ApiError } = {}): ApiClient & { requests: unknown[] } {
  const requests: unknown[] = [];
  return {
    requests,
    checkPasscode: async () => undefined,
    ask: async () => undefined,
    async readPage(body, _passcode, onEvent) {
      requests.push(body);
      for (const event of events) onEvent(event);
      if (opts.throwAfter) throw opts.throwAfter;
    },
  };
}

function callbacks(): PageReadCallbacks & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    onRetry: (problem) => calls.push(`retry:${problem}`),
    onPageStart: (page) => calls.push(`start:${page.number}`),
    onBlock: (page, index) => calls.push(`block:${page.number}:${index}`),
    onPageDone: (page) => calls.push(`done:${page.number}`),
    onError: (code, _message, page) => calls.push(`error:${code}:${page?.number ?? "none"}`),
  };
}

const META: ReadEvent = { type: "meta", status: "ok", language: "en", kind: "letter", title: "A letter" };
const BLOCK: ReadEvent = { type: "block", kind: "paragraph", text: "Hello." };

describe("DocumentSession", () => {
  it("builds a page from the stream and saves the document", async () => {
    const storage = new MemoryStorage();
    const session = new DocumentSession({ api: api([META, BLOCK, { type: "done", blocks: 1 }]), passcode: () => "p", storage });
    const cb = callbacks();
    expect(await session.readPage(IMAGE, cb)).toBe("ok");
    expect(cb.calls).toEqual(["start:1", "block:1:0", "done:1"]);
    expect(session.doc?.title).toBe("A letter");
    expect(session.nextPageNumber).toBe(2);
    expect(loadDoc(storage)?.pages[0]?.blocks).toEqual([{ kind: "paragraph", text: "Hello." }]);
    expect(session.isReading).toBe(false);
    // The photo stays in memory with the page but is never written to storage.
    expect(session.doc?.pages[0]?.image).toBeInstanceOf(Blob);
    expect(storage.getItem("docreader.document.v1")).not.toContain("image");
  });

  it("does not use up the page number when the photo must be retaken", async () => {
    const retry: ReadEvent = { ...META, status: "retry", problem: "Too dark." } as ReadEvent;
    const session = new DocumentSession({ api: api([retry, { type: "done", blocks: 0 }]), passcode: () => "p", storage: null });
    const cb = callbacks();
    expect(await session.readPage(IMAGE, cb)).toBe("retry");
    expect(cb.calls).toEqual(["retry:Too dark."]);
    expect(session.doc).toBeNull();
    expect(session.nextPageNumber).toBe(1);
  });

  it("sends the document language as a hint for later pages", async () => {
    const client = api([{ ...META, language: "es" } as ReadEvent, BLOCK, { type: "done", blocks: 1 }]);
    const session = new DocumentSession({ api: client, passcode: () => "p", storage: null });
    await session.readPage(IMAGE, callbacks());
    await session.readPage(IMAGE, callbacks());
    expect(client.requests[0]).toMatchObject({ pageNumber: 1, languageHint: null });
    expect(client.requests[1]).toMatchObject({ pageNumber: 2, languageHint: "es" });
  });

  it("keeps partial text when the connection drops mid-page", async () => {
    const session = new DocumentSession({ api: api([META, BLOCK], { throwAfter: new ApiError("network") }), passcode: () => "p", storage: null });
    const cb = callbacks();
    expect(await session.readPage(IMAGE, cb)).toBe("error");
    expect(cb.calls).toEqual(["start:1", "block:1:0", "error:network:1"]);
    expect(session.doc?.pages[0]).toMatchObject({ complete: true, failed: true });
  });

  it("reports a server error event", async () => {
    const session = new DocumentSession({
      api: api([{ type: "error", code: "refusal", message: "I couldn't read this page." }]),
      passcode: () => "p",
      storage: null,
    });
    const cb = callbacks();
    expect(await session.readPage(IMAGE, cb)).toBe("error");
    expect(cb.calls).toEqual(["error:refusal:none"]);
  });

  it("fails fast without a passcode", async () => {
    const readPage = vi.fn();
    const session = new DocumentSession({ api: { ...api([]), readPage }, passcode: () => null, storage: null });
    const cb = callbacks();
    expect(await session.readPage(IMAGE, cb)).toBe("error");
    expect(readPage).not.toHaveBeenCalled();
    expect(cb.calls).toEqual(["error:unauthorized:none"]);
  });

  it("restores a saved document and forgets it on New document", async () => {
    const storage = new MemoryStorage();
    const first = new DocumentSession({ api: api([META, BLOCK, { type: "done", blocks: 1 }]), passcode: () => "p", storage });
    await first.readPage(IMAGE, callbacks());
    const second = new DocumentSession({ api: api([]), passcode: () => "p", storage });
    expect(second.doc?.pages).toHaveLength(1);
    second.newDocument();
    expect(second.doc).toBeNull();
    expect(loadDoc(storage)).toBeNull();
  });
});
