import type { VoiceInfo } from "./port";

/** Novelty voices that exist on Apple devices and should never be picked automatically. */
const NOVELTY = /\b(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Pipe Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Deranged|Hysterical)\b/i;
/**
 * Apple's older synthetic voices. Some screen-reader users choose them on purpose for speed, so
 * they stay in the list, but they are never the automatic choice.
 */
const ROBOTIC = /\b(Eddy|Flo|Reed|Rocko|Sandy|Shelley|Grandma|Grandpa|Fred|Junior|Kathy|Ralph)\b/i;

export type VoiceQuality = "premium" | "enhanced" | "standard";

export function baseLanguage(tag: string): string {
  return tag.toLowerCase().replace(/_/g, "-").split("-")[0] ?? "";
}

/**
 * How good a voice sounds, from its name. On the iPhone, voices downloaded under Accessibility,
 * Spoken Content, Voices are marked Enhanced or Premium and sound far more natural than the
 * built-in compact ones.
 */
export function voiceQuality(voice: VoiceInfo): VoiceQuality {
  const id = `${voice.name} ${voice.voiceURI}`;
  if (/premium/i.test(id)) return "premium";
  if (/enhanced|siri/i.test(id)) return "enhanced";
  return "standard";
}

function qualityScore(voice: VoiceInfo): number {
  const id = `${voice.name} ${voice.voiceURI}`;
  if (/premium/i.test(id)) return 4;
  if (/enhanced/i.test(id)) return 3;
  if (/siri/i.test(id)) return 2;
  return 0;
}

/** True when nothing better than a basic voice speaks the language: a download would help. */
export function betterVoiceAvailable(voices: VoiceInfo[], lang: string): boolean {
  const candidates = voicesForLanguage(voices, lang);
  return candidates.length > 0 && candidates.every((v) => voiceQuality(v) === "standard");
}

/**
 * Chooses a voice for a language: the user's chosen voice if it speaks the language, otherwise
 * the best available voice for it (Premium, then Enhanced, then the exact region, then the
 * system default for that language). Returns null when no voice speaks the language; the
 * engine then uses its default with `utterance.lang` set.
 */
export function pickVoice(voices: VoiceInfo[], lang: string, preferredURI: string | null): VoiceInfo | null {
  const base = baseLanguage(lang);
  const candidates = voices.filter((v) => baseLanguage(v.lang) === base);
  if (candidates.length === 0) return null;
  if (preferredURI) {
    const preferred = candidates.find((v) => v.voiceURI === preferredURI);
    if (preferred) return preferred;
  }
  const exact = lang.toLowerCase().replace(/_/g, "-");
  let best: VoiceInfo | null = null;
  let bestScore = -Infinity;
  for (const voice of candidates) {
    let score = qualityScore(voice) * 10;
    if (voice.lang.toLowerCase().replace(/_/g, "-") === exact) score += 3;
    if (voice.default) score += 2;
    if (voice.localService) score += 1;
    if (NOVELTY.test(voice.name)) score -= 100;
    if (ROBOTIC.test(voice.name)) score -= 30;
    if (/com\.apple\.speech\.synthesis\.voice\./i.test(voice.voiceURI)) score -= 20;
    if (score > bestScore) {
      best = voice;
      bestScore = score;
    }
  }
  return best;
}

/** Voices for a language, best first, for the Settings list. Novelty voices are left out. */
export function voicesForLanguage(voices: VoiceInfo[], lang: string): VoiceInfo[] {
  const base = baseLanguage(lang);
  return voices
    .filter((v) => baseLanguage(v.lang) === base && !NOVELTY.test(v.name))
    .sort((a, b) => qualityScore(b) - qualityScore(a) || a.name.localeCompare(b.name));
}
