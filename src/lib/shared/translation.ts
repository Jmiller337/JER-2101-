/**
 * Translating documents into English (built but switched off: see TRANSLATE_FROM in
 * docs/SETUP.md). Only the languages listed here can be switched on. Each needs its own
 * checks on real letters before it is used, so a language is added here only when asked for.
 */
export const TRANSLATABLE_LANGUAGES: Readonly<Record<string, string>> = {
  fr: "French",
};

/** "fr-CA" and "FR" are "fr". */
export function baseLanguage(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] ?? "";
}

/** The languages switched on by the server's TRANSLATE_FROM setting ("fr"); unknown ones are ignored. */
export function parseTranslateFrom(value: string | undefined): string[] {
  const codes = (value ?? "")
    .split(",")
    .map(baseLanguage)
    .filter((code) => code in TRANSLATABLE_LANGUAGES);
  return [...new Set(codes)];
}

/** "Translated from French." */
export function translationNote(from: string): string {
  const code = baseLanguage(from);
  return `Translated from ${TRANSLATABLE_LANGUAGES[code] ?? code}.`;
}
