import { z } from "zod";
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
  warning?: string;
  blocks: DocBlock[];
  complete: boolean;
  /** The read stopped early (an error after some text arrived). */
  failed?: boolean;
}

export interface Doc {
  id: string;
  title: string;
  language: string;
  pages: DocPage[];
}

const DOC_KEY = "docreader.document.v1";

const StoredDoc = z.object({
  id: z.string(),
  title: z.string(),
  language: z.string(),
  pages: z.array(
    z.object({
      number: z.number().int().positive(),
      language: z.string(),
      kind: z.string(),
      title: z.string(),
      warning: z.string().optional(),
      blocks: z.array(z.object({ kind: z.enum(BLOCK_KINDS), text: z.string() })),
      complete: z.boolean(),
      failed: z.boolean().optional(),
    }),
  ),
});

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
  writeJson(storage, DOC_KEY, doc);
}

export function loadDoc(storage: StorageLike | null): Doc | null {
  const parsed = StoredDoc.safeParse(readJson(storage, DOC_KEY));
  if (!parsed.success || parsed.data.pages.length === 0) return null;
  // A page that was still streaming when the page was reloaded is kept as far as it got.
  return { ...parsed.data, pages: parsed.data.pages.map((page) => ({ ...page, complete: true })) };
}

export function clearDoc(storage: StorageLike | null): void {
  removeKey(storage, DOC_KEY);
}
