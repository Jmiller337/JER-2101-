/**
 * Prepares transcript text for the speech engine: markers become words ("unclear word",
 * "possibly"), whitespace is collapsed, and stray punctuation left behind is tidied.
 */
export function toSpoken(text: string): string {
  let t = text.replace(/\[unclear\]/gi, " unclear word ");
  // "Smithson [?]," becomes "Smithson, possibly," and "Smithson [?] wrote" becomes
  // "Smithson, possibly, wrote".
  t = t.replace(/\s*\[\?\]\s*([,.;:!?])?/g, (_match, punct: string | undefined) =>
    punct ? `, possibly${punct} ` : ", possibly, ",
  );
  t = t
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/,(\s*,)+/g, ",")
    .replace(/,\s*([.;:!?])/g, "$1")
    .trim();
  if (t.endsWith(",")) t = t.slice(0, -1).trimEnd();
  if (t.startsWith(",")) t = t.slice(1).trimStart();
  return t;
}

/** "Speed 1.5." Rates are shown and spoken with one decimal place. */
export function speedAnnouncement(rate: number): string {
  return `Speed ${rate.toFixed(1)}.`;
}
