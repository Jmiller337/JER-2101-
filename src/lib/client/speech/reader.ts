import type { BlockKind } from "@/lib/shared/protocol";
import { Store } from "../store";
import { speedAnnouncement, toSpoken } from "../text/normalize";
import { chunkForSpeech, splitSentences } from "../text/sentences";
import { spellChunks } from "../text/spell";
import type { Speaker, Timers } from "./speaker";

export type ItemKind = "title" | "pageStart" | "content";

export interface ReaderItem {
  id: number;
  kind: ItemKind;
  /** Text as written, with markers. Used for spelling. */
  text: string;
  /** Text given to the speech engine. */
  spoken: string;
  lang: string;
  page: number;
  /** Index of the block within its page (content items only). */
  block: number | null;
  /** Index of the sentence within its block (content items only). */
  sentence: number | null;
  /** First item of a paragraph-level unit: a block, or a title or page announcement. */
  unitStart: boolean;
}

export type ReaderStatus = "idle" | "playing" | "paused" | "waiting" | "spelling" | "ended";

export interface ReaderSnapshot {
  status: ReaderStatus;
  index: number;
  current: ReaderItem | null;
  itemCount: number;
}

export interface ReaderDeps {
  speaker: Pick<Speaker, "speak" | "cancelContent">;
  timers: Timers;
  /** Current speaking rate from settings. */
  rate(): number;
  /** Language of the app's own sentences ("Paused.", titles, page announcements). */
  uiLang: string;
  /** Soft tick while waiting for text to arrive. */
  tick?(): void;
  waitTickMs?: number;
}

interface PageInfo {
  lang: string;
  blockCount: number;
  complete: boolean;
}

export const END_OF_DOCUMENT = "End of document. Press Play to hear it again, Ask a question, or Add page.";

const ACTIVE: ReadonlySet<ReaderStatus> = new Set(["playing", "waiting", "spelling"]);

/**
 * The reading state machine (PROMPT.md 6.7). It holds the document as a list of speakable items
 * (one sentence, or part of a long sentence, per item) and speaks exactly one item at a time
 * through the Speaker. Every asynchronous callback carries the token that was current when it
 * was scheduled; any user action bumps the token, so stale callbacks do nothing.
 */
export class Reader {
  readonly store: Store<ReaderSnapshot>;
  private items: ReaderItem[] = [];
  private readonly pages = new Map<number, PageInfo>();
  private index = 0;
  private status: ReaderStatus = "idle";
  private token = 0;
  private loading = false;
  private waitTimer: unknown = null;
  private pendingAddedPage: number | null = null;
  private nextId = 1;

  constructor(private readonly deps: ReaderDeps) {
    this.store = new Store<ReaderSnapshot>(this.snapshot());
  }

  // -------------------------------------------------------------------------
  // Building the document
  // -------------------------------------------------------------------------

  reset(): void {
    this.invalidate();
    this.deps.speaker.cancelContent();
    this.items = [];
    this.pages.clear();
    this.index = 0;
    this.status = "idle";
    this.loading = false;
    this.pendingAddedPage = null;
    this.emit();
  }

  get hasContent(): boolean {
    return this.items.length > 0;
  }

  get currentStatus(): ReaderStatus {
    return this.status;
  }

  get isActive(): boolean {
    return ACTIVE.has(this.status);
  }

  /** A page's meta line arrived: add its title (page 1) or "Page N.". */
  beginPage(page: number, meta: { title: string; language: string }): void {
    this.pages.set(page, { lang: meta.language, blockCount: 0, complete: false });
    if (page === 1) {
      if (meta.title) this.insert({ kind: "title", text: meta.title, lang: this.deps.uiLang, page });
    } else {
      this.insert({ kind: "pageStart", text: `Page ${page}.`, lang: this.deps.uiLang, page });
    }
    this.itemsChanged();
  }

  /** A block arrived: split it into sentences (and long sentences into chunks). */
  addBlock(page: number, blockIndex: number, _kind: BlockKind, text: string): void {
    const info = this.pages.get(page);
    if (!info) return;
    info.blockCount = Math.max(info.blockCount, blockIndex + 1);
    let first = true;
    splitSentences(text, info.lang).forEach((sentence, sentenceIndex) => {
      for (const chunk of chunkForSpeech(sentence)) {
        this.insert({
          kind: "content",
          text: chunk,
          lang: info.lang,
          page,
          block: blockIndex,
          sentence: sentenceIndex,
          unitStart: first,
        });
        first = false;
      }
    });
    this.itemsChanged();
  }

  completePage(page: number): void {
    const info = this.pages.get(page);
    if (info) info.complete = true;
    this.itemsChanged();
  }

  /** Whether a page read is in flight (more items may still arrive). */
  setLoading(loading: boolean): void {
    this.loading = loading;
    this.itemsChanged();
  }

  // -------------------------------------------------------------------------
  // Playback controls
  // -------------------------------------------------------------------------

  /** Starts reading from the current position (from the start if the document had ended). */
  play(): void {
    if (this.status === "playing" || this.status === "waiting") return;
    this.invalidate();
    this.deps.speaker.cancelContent();
    if (this.status === "ended" || (this.index >= this.items.length && this.isComplete())) this.index = 0;
    this.speakCurrent();
  }

  /** Continues after a pause, saying "Resuming." first. */
  resume(): void {
    if (this.status !== "paused") {
      this.play();
      return;
    }
    this.invalidate();
    this.deps.speaker.cancelContent();
    if (this.index >= this.items.length && this.isComplete()) this.index = 0;
    this.setStatus("playing");
    this.sayThenContinue("Resuming.");
  }

  pause(opts: { silent?: boolean } = {}): void {
    if (!ACTIVE.has(this.status)) return;
    this.invalidate();
    this.deps.speaker.cancelContent();
    this.setStatus("paused");
    if (!opts.silent) this.say(this.positionReport("Paused"));
  }

  toggle(): void {
    if (ACTIVE.has(this.status)) this.pause();
    else if (this.status === "paused") this.resume();
    else this.play();
  }

  /** Pauses silently (leaving the reading screen). Returns whether reading was active. */
  suspend(): boolean {
    const wasActive = ACTIVE.has(this.status);
    this.pause({ silent: true });
    return wasActive;
  }

  next(): void {
    this.jumpTo(this.index + 1);
  }

  previous(): void {
    if (this.index <= 0 || this.items.length === 0) {
      this.startOfDocument();
      return;
    }
    this.jumpTo(Math.min(this.index, this.items.length) - 1);
  }

  nextParagraph(): void {
    for (let j = this.index + 1; j < this.items.length; j++) {
      if (this.items[j]!.unitStart) {
        this.jumpTo(j);
        return;
      }
    }
    this.jumpTo(this.items.length);
  }

  previousParagraph(): void {
    const unitStart = this.currentUnitStart();
    for (let j = unitStart - 1; j >= 0; j--) {
      if (this.items[j]!.unitStart) {
        this.jumpTo(j);
        return;
      }
    }
    this.startOfDocument();
  }

  /** Spells the current item letter by letter at a slower rate, then pauses on it. */
  spell(): void {
    if (this.items.length === 0) return;
    if (this.index >= this.items.length) this.index = this.items.length - 1;
    const item = this.items[this.index]!;
    this.invalidate();
    this.deps.speaker.cancelContent();
    const chunks = spellChunks(item.text);
    const t = this.token;
    const rate = Math.max(0.5, this.deps.rate() * 0.8);
    this.setStatus("spelling");
    const speakChunk = (i: number) => {
      if (t !== this.token) return;
      if (i >= chunks.length) {
        this.setStatus("paused");
        return;
      }
      this.deps.speaker.speak(chunks[i]!, {
        priority: "content",
        lang: item.lang,
        rate,
        onEnd: () => speakChunk(i + 1),
        onInterrupted: () => {
          if (t !== this.token) return;
          this.invalidate();
          this.setStatus("paused");
        },
      });
    };
    speakChunk(0);
  }

  /** The rate setting changed: announce it, and keep reading at the new rate if reading. */
  rateChanged(): void {
    const text = speedAnnouncement(this.deps.rate());
    if (ACTIVE.has(this.status)) {
      this.invalidate();
      this.deps.speaker.cancelContent();
      this.setStatus("playing");
      this.sayThenContinue(text);
    } else {
      this.say(text);
    }
  }

  /**
   * A short message while the reader may be reading ("That is the fastest speed."): say it, then
   * carry on from the current sentence, instead of the message silently stopping the reading.
   */
  notice(text: string): void {
    if (ACTIVE.has(this.status)) {
      this.invalidate();
      this.deps.speaker.cancelContent();
      this.setStatus("playing");
      this.sayThenContinue(text);
    } else {
      this.say(text);
    }
  }

  /** Removes a page (to retake it). The position moves to where the page was. */
  removePage(page: number): void {
    if (!this.pages.has(page)) return;
    this.invalidate();
    this.deps.speaker.cancelContent();
    const first = this.items.findIndex((item) => item.page === page);
    const removed = this.items.filter((item) => item.page === page).length;
    this.items = this.items.filter((item) => item.page !== page);
    this.pages.delete(page);
    if (first !== -1) {
      if (this.index >= first + removed) this.index -= removed;
      else if (this.index > first) this.index = first;
    }
    if (ACTIVE.has(this.status)) this.status = "paused";
    this.emit();
  }

  /**
   * After a new page is captured. If the document had ended, the new page is announced with
   * "Page N added." and read from its start; otherwise reading continues where it was and flows
   * into the new page at the boundary.
   */
  continueAfterAddPage(page: number): void {
    const ended = this.status === "ended" || (this.index >= this.items.length && this.items.length > 0);
    this.invalidate();
    this.deps.speaker.cancelContent();
    if (ended) {
      this.pendingAddedPage = page;
      this.index = this.items.length;
    }
    this.speakCurrent();
  }

  /** "Paused. Paragraph 3 of 7, page 1 of 2." */
  positionReport(prefix: string): string {
    if (this.items.length === 0) return `${prefix}.`;
    if (this.index >= this.items.length) return this.isComplete() ? `${prefix}. End of document.` : `${prefix}.`;
    const item = this.items[this.index]!;
    const pageCount = this.pages.size;
    const pagePart = pageCount > 1 ? `, page ${item.page} of ${pageCount}` : "";
    if (item.kind === "content" && item.block !== null) {
      const info = this.pages.get(item.page);
      const total = info?.complete ? ` of ${info.blockCount}` : "";
      return `${prefix}. Paragraph ${item.block + 1}${total}${pagePart}.`;
    }
    if (item.kind === "title") return `${prefix}. Start of document.`;
    return `${prefix}. Start of page ${item.page}${pageCount > 1 ? ` of ${pageCount}` : ""}.`;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private speakCurrent(): void {
    this.clearWait();
    const t = this.token;
    if (this.index >= this.items.length) {
      if (this.isComplete() && this.items.length > 0) this.finish();
      else {
        this.setStatus("waiting");
        this.armWait(t);
      }
      return;
    }
    const item = this.items[this.index]!;
    if (this.startsPage(this.index) && this.earlierPageIncomplete(item.page)) {
      // The previous page is still arriving: wait for the rest of it rather than skip ahead.
      this.setStatus("waiting");
      this.armWait(t);
      return;
    }
    let spoken = item.spoken;
    if (this.pendingAddedPage !== null && item.kind === "pageStart" && item.page === this.pendingAddedPage) {
      spoken = `Page ${item.page} added.`;
      this.pendingAddedPage = null;
    }
    this.setStatus("playing");
    this.deps.speaker.speak(spoken, {
      priority: "content",
      lang: item.lang,
      rate: this.deps.rate(),
      onEnd: () => {
        if (t !== this.token) return;
        this.index += 1;
        this.speakCurrent();
      },
      onInterrupted: () => {
        if (t !== this.token) return;
        this.invalidate();
        this.setStatus("paused");
      },
      onError: (error) => {
        if (t !== this.token) return;
        if (error === "not-allowed") {
          // Speech was blocked (no tap yet). Stop rather than racing through the document.
          this.invalidate();
          this.setStatus("paused");
          return;
        }
        this.index += 1;
        this.speakCurrent();
      },
    });
  }

  private jumpTo(target: number): void {
    this.invalidate();
    this.deps.speaker.cancelContent();
    if (target >= this.items.length) {
      this.index = this.items.length;
      if (this.isComplete() && this.items.length > 0) this.finish();
      else {
        this.setStatus("waiting");
        this.armWait(this.token);
      }
      return;
    }
    this.index = Math.max(0, target);
    this.speakCurrent();
  }

  private startOfDocument(): void {
    this.invalidate();
    this.deps.speaker.cancelContent();
    this.index = 0;
    this.setStatus("playing");
    this.sayThenContinue("Start of document.");
  }

  private finish(): void {
    this.index = this.items.length;
    this.setStatus("ended");
    this.say(END_OF_DOCUMENT);
  }

  private startsPage(index: number): boolean {
    return index === 0 || this.items[index - 1]!.page !== this.items[index]!.page;
  }

  private earlierPageIncomplete(page: number): boolean {
    for (const [number, info] of this.pages) if (number < page && !info.complete) return true;
    return false;
  }

  private currentUnitStart(): number {
    let k = Math.min(this.index, this.items.length - 1);
    while (k > 0 && !this.items[k]!.unitStart) k -= 1;
    return Math.max(k, 0);
  }

  private isComplete(): boolean {
    if (this.loading) return false;
    for (const info of this.pages.values()) if (!info.complete) return false;
    return true;
  }

  private itemsChanged(): void {
    this.emit();
    if (this.status === "waiting") this.speakCurrent();
  }

  private insert(partial: {
    kind: ItemKind;
    text: string;
    lang: string;
    page: number;
    block?: number;
    sentence?: number;
    unitStart?: boolean;
  }): void {
    const item: ReaderItem = {
      id: this.nextId++,
      kind: partial.kind,
      text: partial.text,
      spoken: toSpoken(partial.text),
      lang: partial.lang,
      page: partial.page,
      block: partial.block ?? null,
      sentence: partial.sentence ?? null,
      unitStart: partial.unitStart ?? true,
    };
    // Keep items in page order even if a late block for an earlier page arrives.
    const oldLength = this.items.length;
    let at = oldLength;
    while (at > 0 && this.items[at - 1]!.page > item.page) at -= 1;
    this.items.splice(at, 0, item);
    // Keep pointing at the same item while it is being spoken. When the reader is waiting (past
    // the end, or at the start of a later page while an earlier page is still arriving), the new
    // item becomes the next one to speak.
    const speakingCurrent = this.status === "playing" || this.status === "spelling";
    if (at < this.index || (at === this.index && this.index < oldLength && speakingCurrent)) this.index += 1;
  }

  /** Speaks one of the reader's own sentences, with no continuation. */
  private say(text: string): void {
    this.deps.speaker.speak(text, { priority: "content", lang: this.deps.uiLang, rate: this.deps.rate() });
  }

  /** Speaks one of the reader's own sentences, then continues reading. */
  private sayThenContinue(text: string): void {
    const t = this.token;
    this.deps.speaker.speak(text, {
      priority: "content",
      lang: this.deps.uiLang,
      rate: this.deps.rate(),
      onEnd: () => {
        if (t === this.token) this.speakCurrent();
      },
      onInterrupted: () => {
        if (t !== this.token) return;
        this.invalidate();
        this.setStatus("paused");
      },
    });
  }

  private armWait(t: number): void {
    this.clearWait();
    const delay = this.deps.waitTickMs ?? 2000;
    const tick = () => {
      if (t !== this.token || this.status !== "waiting") return;
      this.deps.tick?.();
      this.waitTimer = this.deps.timers.setTimeout(tick, delay);
    };
    this.waitTimer = this.deps.timers.setTimeout(tick, delay);
  }

  private clearWait(): void {
    if (this.waitTimer !== null) {
      this.deps.timers.clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
  }

  private invalidate(): void {
    this.token += 1;
    this.clearWait();
  }

  private setStatus(status: ReaderStatus): void {
    this.status = status;
    this.emit();
  }

  private snapshot(): ReaderSnapshot {
    return {
      status: this.status,
      index: this.index,
      current: this.items[this.index] ?? null,
      itemCount: this.items.length,
    };
  }

  private emit(): void {
    this.store.set(this.snapshot());
  }
}
