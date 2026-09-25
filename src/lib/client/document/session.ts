import { spokenError } from "@/lib/shared/messages";
import type { ErrorCode, MetaEvent } from "@/lib/shared/protocol";
import { ApiError, isAbortError, type ApiClient } from "../api";
import type { PreparedImage } from "../camera/prepare";
import type { StorageLike } from "../storage";
import { Store } from "../store";
import { clearDoc, loadDoc, newDocId, saveDoc, type Doc, type DocBlock, type DocPage } from "./model";

export interface PageReadCallbacks {
  /** The model could not read the photo; the page number is not used up. */
  onRetry(problem: string): void;
  onPageStart(page: DocPage, meta: MetaEvent): void;
  onBlock(page: DocPage, index: number, block: DocBlock): void;
  onPageDone(page: DocPage): void;
  /** `page` is null when the failure happened before any text arrived. */
  onError(code: ErrorCode, message: string, page: DocPage | null): void;
}

export type ReadOutcome = "ok" | "retry" | "error" | "aborted";

export interface SessionState {
  doc: Doc | null;
  /** Bumped on every change so React re-renders (the document is mutated in place). */
  version: number;
  /** The page number whose read has started but has not yet returned its first line. */
  awaitingPage: number | null;
  /** Number of page reads in flight. */
  activeReads: number;
}

/**
 * Owns the current document and runs page reads: sends the photo, turns the streamed events
 * into pages and blocks, and reports progress through callbacks. Keeps the document (without
 * images) in sessionStorage.
 */
export class DocumentSession {
  readonly store: Store<SessionState>;
  private readonly aborts = new Set<AbortController>();

  constructor(
    private readonly deps: {
      api: ApiClient;
      passcode: () => string | null;
      storage: StorageLike | null;
    },
  ) {
    this.store = new Store<SessionState>({ doc: loadDoc(deps.storage), version: 0, awaitingPage: null, activeReads: 0 });
  }

  get doc(): Doc | null {
    return this.store.get().doc;
  }

  get nextPageNumber(): number {
    return (this.doc?.pages.length ?? 0) + 1;
  }

  get isReading(): boolean {
    return this.store.get().activeReads > 0;
  }

  get awaitingFirstLine(): boolean {
    return this.store.get().awaitingPage !== null;
  }

  newDocument(): void {
    for (const abort of this.aborts) abort.abort();
    this.aborts.clear();
    this.store.set((s) => ({ doc: null, version: s.version + 1, awaitingPage: null, activeReads: 0 }));
    clearDoc(this.deps.storage);
  }

  /** Removes the last page (to retake it). Only the last page can be removed. */
  removeLastPage(pageNumber: number): void {
    const doc = this.doc;
    const last = doc?.pages[doc.pages.length - 1];
    if (!doc || !last || last.number !== pageNumber) return;
    doc.pages.pop();
    if (doc.pages.length === 0) {
      this.store.set((s) => ({ ...s, doc: null, version: s.version + 1 }));
      clearDoc(this.deps.storage);
      return;
    }
    this.changed();
  }

  async readPage(image: PreparedImage, cb: PageReadCallbacks): Promise<ReadOutcome> {
    const pageNumber = this.nextPageNumber;
    const passcode = this.deps.passcode();
    if (!passcode) {
      cb.onError("unauthorized", spokenError("unauthorized"), null);
      return "error";
    }
    const abort = new AbortController();
    this.aborts.add(abort);
    this.store.update({ awaitingPage: pageNumber, activeReads: this.store.get().activeReads + 1 });

    let page: DocPage | null = null;
    let outcome: ReadOutcome = "error";
    const clearAwaiting = () => {
      if (this.store.get().awaitingPage === pageNumber) this.store.update({ awaitingPage: null });
    };

    try {
      await this.deps.api.readPage(
        {
          image: { mediaType: image.mediaType, data: image.base64 },
          pageNumber,
          languageHint: this.doc?.language ?? null,
        },
        passcode,
        (event) => {
          if (abort.signal.aborted) return;
          switch (event.type) {
            case "meta": {
              if (page || outcome === "retry") return;
              clearAwaiting();
              if (event.status === "retry") {
                outcome = "retry";
                cb.onRetry(event.problem ?? spokenError("empty"));
                return;
              }
              page = {
                number: pageNumber,
                language: event.language,
                kind: event.kind,
                title: event.title,
                blocks: [],
                complete: false,
                ...(image.blob ? { image: image.blob } : {}),
              };
              this.addPage(page);
              cb.onPageStart(page, event);
              return;
            }
            case "block": {
              if (!page) return;
              const block: DocBlock = { kind: event.kind, text: event.text };
              page.blocks.push(block);
              this.changed();
              cb.onBlock(page, page.blocks.length - 1, block);
              return;
            }
            case "done": {
              if (!page) return;
              outcome = "ok";
              page.complete = true;
              this.changed();
              cb.onPageDone(page);
              return;
            }
            case "error": {
              outcome = "error";
              clearAwaiting();
              if (page) {
                page.complete = true;
                page.failed = true;
                this.changed();
              }
              cb.onError(event.code ?? "server", event.message, page);
              return;
            }
          }
        },
        abort.signal,
      );
    } catch (err) {
      if (abort.signal.aborted || isAbortError(err)) return "aborted";
      const code: ErrorCode = err instanceof ApiError ? err.code : "network";
      if (page) {
        const failed: DocPage = page;
        failed.complete = true;
        failed.failed = true;
        this.changed();
      }
      clearAwaiting();
      outcome = "error";
      cb.onError(code, spokenError(code, "read"), page);
    } finally {
      this.aborts.delete(abort);
      if (!abort.signal.aborted) {
        clearAwaiting();
        this.store.update({ activeReads: Math.max(0, this.store.get().activeReads - 1) });
      }
    }
    return abort.signal.aborted ? "aborted" : outcome;
  }

  private addPage(page: DocPage): void {
    const current = this.doc;
    const doc: Doc = current ?? { id: newDocId(), title: page.title, language: page.language, pages: [] };
    doc.pages.push(page);
    doc.pages.sort((a, b) => a.number - b.number);
    if (page.number === 1) {
      doc.title = page.title;
      doc.language = page.language;
    }
    this.store.set((s) => ({ ...s, doc, version: s.version + 1 }));
    saveDoc(this.deps.storage, doc);
  }

  private changed(): void {
    const doc = this.doc;
    this.store.set((s) => ({ ...s, version: s.version + 1 }));
    if (doc) saveDoc(this.deps.storage, doc);
  }
}
