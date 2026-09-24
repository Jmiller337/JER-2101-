/**
 * Sentence splitting for speech. `Intl.Segmenter` does the work where available; a regular
 * expression is the fallback. Markers are protected first, because the "?" inside "[?]" would
 * otherwise end a sentence, and pieces that end in common abbreviations or list numbers are
 * merged back. No regex lookbehind anywhere: Safari before 16.4 cannot parse it.
 */

const PROTECT_UNCLEAR = "";
const PROTECT_DOUBT = "";

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "mx", "dr", "st", "jr", "sr", "prof", "rev", "hon", "gen", "col", "capt", "lt", "sgt",
  "no", "nos", "vs", "etc", "inc", "ltd", "co", "corp", "llc", "dept", "apt", "ave", "blvd", "rd", "ln", "mt",
  "ft", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "approx", "acct",
  "tel", "ext", "fig", "vol", "pp", "ref", "est", "min", "max", "dist", "gov", "univ", "assn",
]);

export function splitSentences(text: string, locale = "en"): string[] {
  const protectedText = text.replace(/\[unclear\]/gi, PROTECT_UNCLEAR).replace(/\[\?\]/g, PROTECT_DOUBT);
  let pieces = segment(protectedText, locale);
  pieces = mergeFalseBreaks(pieces);
  return pieces
    .map((piece) =>
      piece.split(PROTECT_UNCLEAR).join("[unclear]").split(PROTECT_DOUBT).join("[?]").trim(),
    )
    .filter((piece) => piece.length > 0);
}

function segment(text: string, locale: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Segmenter) {
    try {
      const segmenter = new Segmenter(locale, { granularity: "sentence" });
      return Array.from(segmenter.segment(text), (s) => s.segment);
    } catch {
      // unsupported locale: fall through
    }
  }
  return text.match(/[^.!?]+(?:[.!?]+["')\]]*\s*|$)/g) ?? [text];
}

function mergeFalseBreaks(pieces: string[]): string[] {
  const out: string[] = [];
  for (const piece of pieces) {
    const prev = out[out.length - 1];
    if (prev !== undefined && endsFalsely(prev)) out[out.length - 1] = prev + piece;
    else out.push(piece);
  }
  return out;
}

/** True when a piece ends with an abbreviation, an initial, or is only a list number. */
function endsFalsely(piece: string): boolean {
  const t = piece.trimEnd();
  if (/^\(?\d{1,3}[.)]$/.test(t.trim())) return true; // "1." at the start of a list item
  if (!t.endsWith(".")) return false;
  const match = /(?:^|[\s(["'])([A-Za-z]+(?:\.[A-Za-z]+)*)\.$/.exec(t);
  const word = match?.[1];
  if (!word) return false;
  if (word.length === 1 && /[A-Z]/.test(word)) return true; // an initial: "J. Smith"
  const lower = word.toLowerCase();
  if (lower.includes(".")) return true; // "e.g", "i.e", "U.S", "a.m"
  return ABBREVIATIONS.has(lower);
}

/**
 * Splits a sentence longer than `max` characters at commas, semicolons, or colons (then at
 * spaces) so no single utterance runs long. Commas inside numbers ("1,234") are not split
 * because a split point needs whitespace after the punctuation.
 */
export function chunkForSpeech(sentence: string, max = 200): string[] {
  const text = sentence.trim();
  if (text.length <= max) return text ? [text] : [];
  const clauses: string[] = [];
  let start = 0;
  for (const match of text.matchAll(/[,;:]\s+/g)) {
    const end = (match.index ?? 0) + 1;
    clauses.push(text.slice(start, end).trim());
    start = (match.index ?? 0) + match[0].length;
  }
  clauses.push(text.slice(start).trim());

  const chunks: string[] = [];
  let current = "";
  for (const clause of clauses) {
    if (!clause) continue;
    if (clause.length > max) {
      if (current) chunks.push(current);
      current = "";
      chunks.push(...splitAtSpaces(clause, max));
      continue;
    }
    if (!current) current = clause;
    else if (current.length + 1 + clause.length <= max) current = `${current} ${clause}`;
    else {
      chunks.push(current);
      current = clause;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitAtSpaces(text: string, max: number): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (current.length + 1 + word.length <= max) current = `${current} ${word}`;
    else {
      out.push(current);
      current = word;
    }
  }
  if (current) out.push(current);
  return out;
}
