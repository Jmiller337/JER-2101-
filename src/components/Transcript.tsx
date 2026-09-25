"use client";

import { Fragment, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { Doc, DocBlock, DocPage } from "@/lib/client/document/model";
import type { ReaderItem } from "@/lib/client/speech/reader";
import { splitMarkers, toReadableText } from "@/lib/client/text/markers";
import { splitSentences } from "@/lib/client/text/sentences";
import { usePrefersReducedMotion } from "./hooks";

interface TranscriptProps {
  doc: Doc;
  version: number;
  /** The item being spoken (read-aloud mode), for highlighting. */
  current: ReaderItem | null;
  /**
   * Plain mode renders each block as one run of text with markers written out in words. It is
   * used whenever VoiceOver reads the transcript, because VoiceOver on iOS stops at every inline
   * element and would make the user swipe sentence by sentence.
   */
  plain: boolean;
}

/**
 * The document as real text: page headings, block headings as h2, paragraphs as p, list items
 * as a list, table rows and label-value lines as short paragraphs (PROMPT.md screen 2).
 */
export function Transcript({ doc, version, current, plain }: TranscriptProps) {
  const reducedMotion = usePrefersReducedMotion();
  const highlightRef = useRef<HTMLSpanElement | null>(null);
  const highlightKey = current && current.kind === "content" ? `${current.page}-${current.block}-${current.sentence}` : null;

  useEffect(() => {
    if (plain || !highlightKey) return;
    highlightRef.current?.scrollIntoView({ block: "center", behavior: reducedMotion ? "auto" : "smooth" });
  }, [highlightKey, plain, reducedMotion]);

  const pages = useMemo(() => doc.pages.slice(), [doc, version]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-6" data-testid="transcript">
      {pages.map((page) => (
        <section key={page.number} className="flex flex-col gap-4">
          {pages.length > 1 && (
            <h2 className="self-start rounded-full border border-accent/60 bg-accent-soft px-4 py-1 text-xl font-bold text-accent">
              Page {page.number}
            </h2>
          )}
          {renderBlocks(page, plain, highlightKey, highlightRef)}
          {page.failed && <p className="text-xl text-muted italic">The rest of this page could not be read.</p>}
        </section>
      ))}
    </div>
  );
}

function renderBlocks(
  page: DocPage,
  plain: boolean,
  highlightKey: string | null,
  highlightRef: React.RefObject<HTMLSpanElement | null>,
): ReactNode[] {
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flushList = (key: string) => {
    if (list.length === 0) return;
    out.push(
      <ul key={`list-${key}`} className="flex list-disc flex-col gap-2 pl-8 text-2xl">
        {list}
      </ul>,
    );
    list = [];
  };
  page.blocks.forEach((block, index) => {
    const key = `${page.number}-${index}`;
    const content = blockContent(block, page, index, plain, highlightKey, highlightRef);
    if (block.kind === "list_item") {
      list.push(<li key={key}>{content}</li>);
      return;
    }
    flushList(key);
    switch (block.kind) {
      case "heading":
        out.push(
          <h2 key={key} className="text-3xl font-bold">
            {content}
          </h2>,
        );
        break;
      case "note":
        out.push(
          <p key={key} className="text-2xl text-muted italic">
            {content}
          </p>,
        );
        break;
      case "table_row":
      case "label_value":
        out.push(
          <p key={key} className="border-l-4 border-accent/60 pl-3 text-2xl">
            {content}
          </p>,
        );
        break;
      default:
        out.push(
          <p key={key} className="text-2xl leading-relaxed">
            {content}
          </p>,
        );
    }
  });
  flushList("end");
  return out;
}

function blockContent(
  block: DocBlock,
  page: DocPage,
  blockIndex: number,
  plain: boolean,
  highlightKey: string | null,
  highlightRef: React.RefObject<HTMLSpanElement | null>,
): ReactNode {
  if (plain) return toReadableText(block.text);
  return splitSentences(block.text, page.language).map((sentence, sentenceIndex) => {
    const key = `${page.number}-${blockIndex}-${sentenceIndex}`;
    const active = key === highlightKey;
    return (
      <Fragment key={key}>
        {sentenceIndex > 0 && " "}
        <span
          ref={active ? highlightRef : undefined}
          className={active ? "reading-current" : undefined}
          data-current={active || undefined}
        >
          {withMarkers(sentence)}
        </span>
      </Fragment>
    );
  });
}

function withMarkers(text: string): ReactNode[] {
  return splitMarkers(text).map((part, i) => {
    if (part.type === "text") return <Fragment key={i}>{part.text}</Fragment>;
    return (
      <mark key={i} className="reading-marker">
        {part.type === "unclear" ? "(unclear word)" : "(possibly)"}
      </mark>
    );
  });
}
