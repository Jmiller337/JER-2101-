import { BLOCK_KINDS, type BlockKind } from "@/lib/shared/protocol";
import { readJson, removeKey, writeJson, type StorageLike } from "../storage";

export interface DocBlock {
  kind: BlockKind;
  text: string;
}

export interface DocPage {
  number: number;
  language: string;
  kind: string;
  title: string;
  blocks: DocBlock[];
  complete: boolean;
  /** The read stopped early (an error after some text arrived). */
  failed?: boolean;
  /**
   * The photo this page was read from, kept in memory for the session so a later version can
   * re-read the page or answer questions about the image (PROMPT.md 6.4 and 6.9). Never stored.
   */
  image?: Blob;
}

export interface Doc {
  id: string;
  title: string;
  language: string;
  pages: DocPage[];
}

const DOC_KEY = "docreader.document.v1";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseBlock(value: unknown): DocBlock | null {
  if (!isObject(value) || typeof value.text !== "string") return null;
  if (!(BLOCK_KINDS as readonly unknown[]).includes(value.kind)) return null;
  return { kind: value.kind as BlockKind, text: value.text };
}

function parsePage(value: unknown): DocPage | null {
  if (!isObject(value)) return null;
  const { number, language, kind, title, blocks, complete, failed } = value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1) return null;
  if (typeof language !== "string" || typeof kind !== "string" || typeof title !== "string") return null;
  if (typeof complete !== "boolean" || (failed !== undefined && typeof failed !== "boolean")) return null;
  if (!Array.isArray(blocks)) return null;
  const parsed = blocks.map(parseBlock);
  if (parsed.some((b) => b === null)) return null;
  return {
    number,
    language,
    kind,
    title,
    blocks: parsed as DocBlock[],
    complete,
    ...(failed !== undefined ? { failed } : {}),
  };
}

/** Validates a stored document; anything malformed is discarded rather than half-loaded. */
function parseDoc(value: unknown): Doc | null {
  if (!isObject(value)) return null;
  const { id, title, language, pages } = value;
  if (typeof id !== "string" || typeof title !== "string" || typeof language !== "string" || !Array.isArray(pages)) return null;
  const parsed = pages.map(parsePage);
  if (parsed.some((p) => p === null)) return null;
  return { id, title, language, pages: parsed as DocPage[] };
}

export function newDocId(): string {
  return `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Plain text of one page for the question service: headings and list items marked lightly. */
export function pageToPlainText(page: DocPage): string {
  return page.blocks
    .map((block) => {
      if (block.kind === "heading") return `## ${block.text}`;
      if (block.kind === "list_item") return `- ${block.text}`;
      return block.text;
    })
    .join("\n");
}

export function docToAskPages(doc: Doc): string[] {
  return doc.pages.map(pageToPlainText);
}

/** Saves the document (text only, never images) so an accidental reload does not lose it. */
export function saveDoc(storage: StorageLike | null, doc: Doc): void {
  writeJson(storage, DOC_KEY, {
    ...doc,
    pages: doc.pages.map((page) => {
      const copy: DocPage = { ...page };
      delete copy.image;
      return copy;
    }),
  });
}

export function loadDoc(storage: StorageLike | null): Doc | null {
  const doc = parseDoc(readJson(storage, DOC_KEY));
  if (!doc || doc.pages.length === 0) return null;
  // A page that was still streaming when the page was reloaded is kept as far as it got.
  return { ...doc, pages: doc.pages.map((page) => ({ ...page, complete: true })) };
}

export function clearDoc(storage: StorageLike | null): void {
  removeKey(storage, DOC_KEY);
}
