import { LineSplitter } from "@/lib/shared/ndjson";
import { spokenError } from "@/lib/shared/messages";
import {
  BLOCK_KINDS,
  type BlockEvent,
  type BlockKind,
  type ErrorCode,
  type MetaEvent,
  type ReadEvent,
} from "@/lib/shared/protocol";

/**
 * If no valid meta (or block) line has appeared within this many characters of model output,
 * the output is treated as plain text so the user still hears the page (PROMPT.md 6.5).
 */
export const DETECT_LIMIT_CHARS = 600;
/** A JSON line still being received is not counted toward the limit until it gets this long. */
const PENDING_JSON_GRACE_CHARS = 4000;
const MAX_BLOCK_CHARS = 8000;

export const DEFAULT_TITLE = "Here is what the page says.";
export const DEFAULT_PROBLEM = "I couldn't read the page. Hold the phone steady over the page and try again.";

type Mode = "detect" | "ndjson" | "plaintext";

export interface ParserStats {
  mode: Mode;
  blocks: number;
  dropped: number;
  metaStatus: "ok" | "retry" | null;
  /** Pages read (more than one only for a PDF). */
  pages: number;
}

/**
 * Turns the model's streamed text into validated protocol events.
 *
 * The model is asked for NDJSON, but the stream is handled defensively: code fences and prose
 * are ignored, lines that are almost JSON are repaired, several objects on one line are split,
 * a missing meta line is synthesized, and output that never looks like NDJSON is converted from
 * plain text into paragraph blocks. The parser writes its own final `done` (with the real block
 * count) or `error` event; the model's own `done` line is ignored.
 */
export class ModelOutputParser {
  private readonly splitter = new LineSplitter();
  private mode: Mode = "detect";
  private detectLines: string[] = [];
  private detectChars = 0;
  private metaSent = false;
  private metaStatus: "ok" | "retry" | null = null;
  private blocks = 0;
  private dropped = 0;
  private paragraph: string[] = [];
  private closed = false;
  private page: number;
  private blocksOnPage = 0;

  constructor(
    private readonly opts: {
      languageHint?: string | null;
      /** The document page number of the first page read. */
      firstPage?: number;
      /** A PDF: the model's page lines start new pages. Ignored for a photo. */
      multiPage?: boolean;
    } = {},
  ) {
    this.page = opts.firstPage ?? 1;
  }

  push(text: string): ReadEvent[] {
    if (this.closed) return [];
    const out: ReadEvent[] = [];
    for (const line of this.splitter.push(text)) this.handleLine(line, out);
    if (this.mode === "detect" && this.detectBudgetExceeded()) this.enterPlaintext(out);
    return out;
  }

  /** Call when the model stream ends normally. Always ends with `done` or `error`. */
  finish(): ReadEvent[] {
    if (this.closed) return [];
    const out: ReadEvent[] = [];
    for (const line of this.splitter.flush()) this.handleLine(line, out);
    if (this.mode === "detect" && this.detectLines.some(isContentLine)) this.enterPlaintext(out);
    if (this.mode === "plaintext") this.flushParagraph(out);
    this.closed = true;
    if (!this.metaSent) {
      out.push(errorEvent("empty"));
      return out;
    }
    out.push({ type: "done", blocks: this.blocks });
    return out;
  }

  /** Call when the stream fails or the model refuses. Partial output already sent stays sent. */
  fail(code: ErrorCode): ReadEvent[] {
    if (this.closed) return [];
    this.closed = true;
    return [errorEvent(code)];
  }

  get stats(): ParserStats {
    const firstPage = this.opts.firstPage ?? 1;
    return {
      mode: this.mode,
      blocks: this.blocks,
      dropped: this.dropped,
      metaStatus: this.metaStatus,
      pages: this.metaSent ? this.page - firstPage + 1 : 0,
    };
  }

  // -------------------------------------------------------------------------

  private detectBudgetExceeded(): boolean {
    const pending = this.splitter.pending.trimStart();
    const pendingChars =
      pending.startsWith("{") && pending.length < PENDING_JSON_GRACE_CHARS ? 0 : pending.length;
    return this.detectChars + pendingChars > DETECT_LIMIT_CHARS;
  }

  private handleLine(raw: string, out: ReadEvent[]): void {
    const line = raw.trim();
    if (!line) {
      if (this.mode === "plaintext") this.flushParagraph(out);
      else if (this.mode === "detect") this.recordDetect(raw);
      return;
    }
    if (isFence(line)) return;

    const objects = parseJsonObjects(line);
    switch (this.mode) {
      case "detect": {
        if (objects.length > 0) {
          let recognized = false;
          for (const obj of objects) recognized = this.handleObject(obj, out) || recognized;
          if (!recognized) this.dropped += 1;
          if (this.metaSent) {
            this.mode = "ndjson";
            this.detectLines = [];
          }
          return;
        }
        this.recordDetect(raw);
        return;
      }
      case "ndjson": {
        if (objects.length === 0) {
          this.dropped += 1; // prose between JSON lines is ignored
          return;
        }
        let recognized = false;
        for (const obj of objects) recognized = this.handleObject(obj, out) || recognized;
        if (!recognized) this.dropped += 1;
        return;
      }
      case "plaintext": {
        if (objects.length > 0) {
          let recognized = false;
          for (const obj of objects) recognized = this.handleObject(obj, out) || recognized;
          if (recognized) return;
        }
        this.plainLine(line, out);
        return;
      }
    }
  }

  /** Returns true when the object was a protocol object (used or deliberately ignored). */
  private handleObject(obj: unknown, out: ReadEvent[]): boolean {
    if (!isRecord(obj)) return false;
    if (obj.type === "meta") {
      if (this.metaSent) {
        this.dropped += 1;
        return true;
      }
      this.emitMeta(this.normalizeMeta(obj), out);
      return true;
    }
    if (obj.type === "block") {
      const blocks = normalizeBlock(obj);
      if (blocks.length === 0) {
        this.dropped += 1;
        return true;
      }
      if (!this.metaSent) this.emitMeta(this.syntheticMeta(), out);
      if (this.metaStatus === "retry") {
        this.dropped += 1;
        return true;
      }
      if (this.mode === "plaintext") this.flushParagraph(out);
      for (const block of blocks) this.emitBlock(block, out);
      return true;
    }
    if (obj.type === "page") {
      // A new page starts only when the page before it has text, so a page line before the
      // first block (or two in a row) never makes an empty page.
      if (!this.opts.multiPage || !this.metaSent || this.metaStatus === "retry" || this.blocksOnPage === 0) {
        this.dropped += 1;
        return true;
      }
      if (this.mode === "plaintext") this.flushParagraph(out);
      this.page += 1;
      this.blocksOnPage = 0;
      out.push({ type: "page", number: this.page });
      return true;
    }
    if (obj.type === "done") return true;
    return false;
  }

  private emitMeta(meta: MetaEvent, out: ReadEvent[]): void {
    this.metaSent = true;
    this.metaStatus = meta.status;
    out.push(meta);
  }

  private emitBlock(block: BlockEvent, out: ReadEvent[]): void {
    this.blocks += 1;
    this.blocksOnPage += 1;
    out.push(block);
  }

  private recordDetect(raw: string): void {
    this.detectLines.push(raw);
    this.detectChars += raw.length + 1;
  }

  private enterPlaintext(out: ReadEvent[]): void {
    this.mode = "plaintext";
    if (!this.metaSent) this.emitMeta(this.syntheticMeta(), out);
    const lines = this.detectLines;
    this.detectLines = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) this.flushParagraph(out);
      else if (!isFence(line)) this.plainLine(line, out);
    }
  }

  private plainLine(line: string, out: ReadEvent[]): void {
    if (this.metaStatus === "retry") return;
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    if (heading?.[1]) {
      this.flushParagraph(out);
      this.pushPlainBlock("heading", heading[1], out);
      return;
    }
    const bullet = /^[-*•]\s+(.+)$/.exec(line);
    if (bullet?.[1]) {
      this.flushParagraph(out);
      this.pushPlainBlock("list_item", bullet[1], out);
      return;
    }
    if (/^\d{1,3}[.)]\s+\S/.test(line)) {
      this.flushParagraph(out);
      this.pushPlainBlock("list_item", line, out);
      return;
    }
    this.paragraph.push(line);
  }

  private flushParagraph(out: ReadEvent[]): void {
    if (this.paragraph.length === 0) return;
    const text = this.paragraph.join(" ");
    this.paragraph = [];
    this.pushPlainBlock("paragraph", text, out);
  }

  private pushPlainBlock(kind: BlockKind, text: string, out: ReadEvent[]): void {
    for (const piece of splitLongText(stripMarkdown(collapseWhitespace(text)), MAX_BLOCK_CHARS)) {
      this.emitBlock({ type: "block", kind, text: piece }, out);
    }
  }

  private normalizeMeta(obj: Record<string, unknown>): MetaEvent {
    const status = obj.status === "retry" ? "retry" : "ok";
    const language = normalizeLanguage(obj.language) ?? this.fallbackLanguage();
    const kind = cleanString(obj.kind, 60) || "other";
    const title = cleanString(obj.title, 400) || (status === "ok" ? DEFAULT_TITLE : "");
    // A "warning" the model may still write is dropped: remarks about the photo are never
    // spoken. The problem line exists only for a page that could not be read at all.
    const problem = status === "retry" ? cleanString(obj.problem, 400) || DEFAULT_PROBLEM : "";
    return {
      type: "meta",
      status,
      language,
      kind,
      title,
      ...(problem ? { problem } : {}),
    };
  }

  private syntheticMeta(): MetaEvent {
    return { type: "meta", status: "ok", language: this.fallbackLanguage(), kind: "other", title: DEFAULT_TITLE };
  }

  private fallbackLanguage(): string {
    return normalizeLanguage(this.opts.languageHint) ?? "en";
  }
}

// ---------------------------------------------------------------------------
// Helpers (exported for tests)
// ---------------------------------------------------------------------------

export function errorEvent(code: ErrorCode): ReadEvent {
  return { type: "error", code, message: spokenError(code, "read") };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFence(line: string): boolean {
  return /^`{3,}/.test(line);
}

function isContentLine(raw: string): boolean {
  const line = raw.trim();
  return line.length > 0 && !isFence(line);
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function stripMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/`([^`]+)`/g, "$1");
}

function cleanString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return collapseWhitespace(value).slice(0, max);
}

export function normalizeLanguage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.trim().replace(/_/g, "-");
  return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(tag) ? tag : null;
}

function normalizeBlock(obj: Record<string, unknown>): BlockEvent[] {
  const kind: BlockKind = (BLOCK_KINDS as readonly string[]).includes(obj.kind as string)
    ? (obj.kind as BlockKind)
    : "paragraph";
  if (typeof obj.text !== "string") return [];
  const text = collapseWhitespace(obj.text);
  if (!text) return [];
  return splitLongText(text, MAX_BLOCK_CHARS).map((piece) => ({ type: "block", kind, text: piece }));
}

/** Splits text longer than `max` at spaces so no protocol block exceeds the schema limit. */
export function splitLongText(text: string, max: number): string[] {
  if (text.length <= max) return text ? [text] : [];
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf(" ", max);
    if (cut <= 0) cut = max;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/**
 * Parses one line into zero or more JSON objects. Accepts a trailing comma after the object,
 * a trailing comma inside it, and several objects written on the same line.
 */
export function parseJsonObjects(line: string): unknown[] {
  const text = line.trim().replace(/,\s*$/, "");
  if (!text.startsWith("{")) return [];
  const attempt = (candidate: string): unknown[] | null => {
    try {
      return [JSON.parse(candidate)];
    } catch {
      return null;
    }
  };
  const direct = attempt(text) ?? attempt(text.replace(/,\s*}$/, "}"));
  if (direct) return direct;
  const pieces = text.split(/}\s*,?\s*(?=\{)/);
  if (pieces.length < 2) return [];
  const objects: unknown[] = [];
  pieces.forEach((piece, index) => {
    const candidate = index < pieces.length - 1 ? `${piece}}` : piece;
    const parsed = attempt(candidate);
    if (parsed) objects.push(...parsed);
  });
  return objects;
}
