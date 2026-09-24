const SYMBOL_NAMES: Record<string, string> = {
  ".": "dot",
  ",": "comma",
  ":": "colon",
  ";": "semicolon",
  "!": "exclamation mark",
  "?": "question mark",
  "-": "dash",
  "–": "dash",
  "—": "dash",
  _: "underscore",
  "/": "slash",
  "\\": "backslash",
  "(": "open bracket",
  ")": "close bracket",
  "[": "open square bracket",
  "]": "close square bracket",
  "{": "open brace",
  "}": "close brace",
  "'": "apostrophe",
  "’": "apostrophe",
  "‘": "apostrophe",
  '"': "quote",
  "“": "quote",
  "”": "quote",
  "@": "at sign",
  "#": "number sign",
  $: "dollar sign",
  "€": "euro sign",
  "£": "pound sign",
  "%": "percent",
  "&": "and sign",
  "*": "star",
  "+": "plus",
  "=": "equals",
  "<": "less than",
  ">": "greater than",
  "~": "tilde",
  "^": "caret",
  "|": "vertical bar",
  "°": "degree sign",
};

/**
 * Tokens for spelling text aloud: "capital P", "A", "space", "1", "dot". Lower-case letters are
 * given to the speech engine in upper case so it says the letter's name ("A", not "uh"); upper-case
 * letters are prefixed with "capital". Doubt markers are dropped and unclear markers become
 * "unclear word".
 */
export function spellTokens(text: string): string[] {
  const tokens: string[] = [];
  const parts = text.replace(/\s*\[\?\]/g, "").split(/(\[unclear\])/i);
  for (const part of parts) {
    if (/^\[unclear\]$/i.test(part)) {
      tokens.push("unclear word");
      continue;
    }
    let pendingSpace = false;
    for (const ch of Array.from(part)) {
      if (/\s/.test(ch)) {
        pendingSpace = tokens.length > 0;
        continue;
      }
      if (pendingSpace) {
        tokens.push("space");
        pendingSpace = false;
      }
      if (/\p{Lu}/u.test(ch)) tokens.push(`capital ${ch}`);
      else if (/\p{L}/u.test(ch)) tokens.push(ch.toUpperCase());
      else if (/\p{N}/u.test(ch)) tokens.push(ch);
      else tokens.push(SYMBOL_NAMES[ch] ?? ch);
    }
  }
  return tokens;
}

/** Groups spelling tokens into short utterances, e.g. "capital P, A, Y, space, 1". */
export function spellChunks(text: string, perChunk = 10): string[] {
  const tokens = spellTokens(text);
  const chunks: string[] = [];
  for (let i = 0; i < tokens.length; i += perChunk) chunks.push(tokens.slice(i, i + perChunk).join(", "));
  return chunks;
}
