/**
 * The wire protocol between the phone and the server. Types and small hand-written validators
 * only: this module ships to the phone, so it avoids a validation library (the server validates
 * request bodies with zod in `src/lib/server/schemas.ts`).
 */

/** Kinds of text block the reading engine can return, in reading order. */
export const BLOCK_KINDS = ["heading", "paragraph", "list_item", "table_row", "label_value", "note"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

/** Machine-readable error codes. Every one has a spoken sentence in `messages.ts`. */
export const ERROR_CODES = [
  "network",
  "unauthorized",
  "forbidden",
  "too_large",
  "bad_request",
  "rate_limited",
  "overloaded",
  "refusal",
  "empty",
  "not_configured",
  "server",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const IMAGE_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMediaType = (typeof IMAGE_MEDIA_TYPES)[number];

/** Largest base64 image string accepted (about 7.5 MB decoded; the body cap is 6 MB anyway). */
export const MAX_IMAGE_BASE64_CHARS = 10_000_000;

/** Largest PDF the phone sends: 15 MB, which is 20 million characters of base64. */
export const MAX_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_PDF_BASE64_CHARS = Math.ceil(MAX_PDF_BYTES / 3) * 4;

/** Limits on POST /api/ask bodies, shared so the phone never sends what the server rejects. */
export const ASK_LIMITS = {
  question: 2000,
  historyMessages: 40,
  historyContent: 8000,
} as const;

export const LIMITS_TEXT = {
  language: 35,
  kind: 60,
  title: 400,
  blockText: 8000,
  message: 400,
} as const;

// ---------------------------------------------------------------------------
// Streamed events from POST /api/read (one JSON object per line)
// ---------------------------------------------------------------------------

export interface MetaEvent {
  type: "meta";
  status: "ok" | "retry";
  language: string;
  kind: string;
  title: string;
  /** Only with status "retry": what the user should change before the next photo. */
  problem?: string;
}

export interface BlockEvent {
  type: "block";
  kind: BlockKind;
  text: string;
}

export interface DoneEvent {
  type: "done";
  blocks: number;
}

export interface ErrorEvent {
  type: "error";
  code?: ErrorCode;
  message: string;
}

/** A PDF read moves on to its next page; the blocks that follow belong to page `number`. */
export interface PageEvent {
  type: "page";
  number: number;
}

export type ReadEvent = MetaEvent | BlockEvent | PageEvent | DoneEvent | ErrorEvent;

// ---------------------------------------------------------------------------
// Streamed events from POST /api/ask
// ---------------------------------------------------------------------------

export interface AskTextEvent {
  type: "text";
  text: string;
}

export interface AskDoneEvent {
  type: "done";
}

export type AskEvent = AskTextEvent | AskDoneEvent | ErrorEvent;

// ---------------------------------------------------------------------------
// Request bodies (validated on the server by src/lib/server/schemas.ts)
// ---------------------------------------------------------------------------

/** One photo of one page (`image`), or a PDF with any number of pages (`pdf`): exactly one. */
export interface ReadRequest {
  image?: { mediaType: ImageMediaType; data: string };
  pdf?: { data: string };
  /** The number the first page read will get in the document. */
  pageNumber: number;
  languageHint?: string | null;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AskRequest {
  pages: string[];
  title: string;
  history: ChatTurn[];
  question: string;
}

// ---------------------------------------------------------------------------
// Validators for streamed events. They return null for anything that does not match exactly,
// including unknown event types, which the phone ignores.
// ---------------------------------------------------------------------------

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.length >= min && value.length <= max;
}

function optionalString(value: unknown, max: number): boolean {
  return value === undefined || isString(value, 0, max);
}

function includes<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

function parseErrorEvent(v: Json): ErrorEvent | null {
  if (!isString(v.message, 1, LIMITS_TEXT.message)) return null;
  if (v.code !== undefined && !includes(ERROR_CODES, v.code)) return null;
  return v.code === undefined ? { type: "error", message: v.message } : { type: "error", code: v.code, message: v.message };
}

export function parseReadEvent(value: unknown): ReadEvent | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "meta": {
      if (value.status !== "ok" && value.status !== "retry") return null;
      if (!isString(value.language, 2, LIMITS_TEXT.language)) return null;
      if (!isString(value.kind, 0, LIMITS_TEXT.kind)) return null;
      if (!isString(value.title, 0, LIMITS_TEXT.title)) return null;
      if (!optionalString(value.problem, LIMITS_TEXT.title)) return null;
      const meta: MetaEvent = {
        type: "meta",
        status: value.status,
        language: value.language,
        kind: value.kind,
        title: value.title,
      };
      if (typeof value.problem === "string") meta.problem = value.problem;
      return meta;
    }
    case "block":
      if (!includes(BLOCK_KINDS, value.kind) || !isString(value.text, 1, LIMITS_TEXT.blockText)) return null;
      return { type: "block", kind: value.kind, text: value.text };
    case "page":
      if (typeof value.number !== "number" || !Number.isInteger(value.number) || value.number < 2 || value.number > 5000) return null;
      return { type: "page", number: value.number };
    case "done":
      if (typeof value.blocks !== "number" || !Number.isInteger(value.blocks) || value.blocks < 0) return null;
      return { type: "done", blocks: value.blocks };
    case "error":
      return parseErrorEvent(value);
    default:
      return null;
  }
}

export function parseAskEvent(value: unknown): AskEvent | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "text":
      return typeof value.text === "string" ? { type: "text", text: value.text } : null;
    case "done":
      return { type: "done" };
    case "error":
      return parseErrorEvent(value);
    default:
      return null;
  }
}
