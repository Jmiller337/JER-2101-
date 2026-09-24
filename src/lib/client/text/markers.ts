/** Marker the model writes for a word it cannot read. */
export const UNCLEAR_MARKER = "[unclear]";
/** Marker the model writes after a word it is unsure about. */
export const DOUBT_MARKER = "[?]";

/**
 * Text split into plain runs and markers, for rendering. A doubt marker applies to the word
 * before it.
 */
export type MarkedPart =
  | { type: "text"; text: string }
  | { type: "unclear" }
  | { type: "doubt" };

export function splitMarkers(text: string): MarkedPart[] {
  const parts: MarkedPart[] = [];
  const pattern = /\[unclear\]|\s*\[\?\]/gi;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) parts.push({ type: "text", text: text.slice(last, index) });
    parts.push(match[0].trim().toLowerCase() === UNCLEAR_MARKER ? { type: "unclear" } : { type: "doubt" });
    last = index + match[0].length;
  }
  if (last < text.length) parts.push({ type: "text", text: text.slice(last) });
  return parts;
}

/** The written form used in the transcript for VoiceOver users: plain words, no brackets. */
export function toReadableText(text: string): string {
  return text
    .replace(/\[unclear\]/gi, "(unclear word)")
    .replace(/\s*\[\?\]/g, " (possibly)")
    .replace(/\s+/g, " ")
    .trim();
}
