import { readJson, removeKey, writeJson, type StorageLike } from "./storage";

/**
 * How the app talks to the user.
 * - `readAloud`: the app speaks everything itself (VoiceOver off).
 * - `voiceOver`: status goes to the live region for VoiceOver; the app voice stays silent unless
 *   "Play with app voice" is pressed for a document.
 */
export type Mode = "readAloud" | "voiceOver";

/** Colour themes. Every one keeps all text at 7:1 contrast or better. Automatic follows the iPhone's light or dark mode. */
export type Theme = "auto" | "light" | "dark" | "contrast";

export const THEME_NAMES: Record<Theme, string> = {
  auto: "Automatic",
  light: "Light",
  dark: "Dark",
  contrast: "Black and yellow",
};

export interface Settings {
  mode: Mode | null;
  rate: number;
  voiceURI: string | null;
  autoCapture: boolean;
  guidance: "full" | "minimal";
  sounds: boolean;
  theme: Theme;
  /** The user has moved between the camera screen's modes once, so the swipe hint stops. */
  modesLearned: boolean;
  /** The voice's pitch ("Tone" in Settings). */
  pitch: number;
  /** The voice's loudness, below the phone's own volume. */
  volume: number;
  /** Holds that heard something; after three the camera stops explaining hold-to-talk. */
  talkUses: number;
}

export const RATE_MIN = 0.7;
export const RATE_MAX = 2.0;
export const RATE_STEP = 0.1;
export const PITCH_MIN = 0.8;
export const PITCH_MAX = 1.2;
export const VOLUME_MIN = 0.5;
export const VOLUME_MAX = 1.0;
/** Holds that heard something before the camera's greeting drops the hold-to-talk hint. */
export const TALK_LEARNED_AFTER = 3;

export const DEFAULT_SETTINGS: Settings = {
  mode: null,
  rate: 1,
  voiceURI: null,
  autoCapture: true,
  guidance: "full",
  sounds: true,
  theme: "auto",
  modesLearned: false,
  pitch: 1,
  volume: 1,
  talkUses: 0,
};

const SETTINGS_KEY = "docreader.settings.v1";
const PASSCODE_KEY = "docreader.passcode.v1";

/**
 * Keeps each stored field that has the right type and drops the rest, so a corrupt or older
 * value never breaks the app. Any field with a wrong value makes the whole record untrusted.
 */
function parseStoredSettings(value: unknown): Partial<Settings> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const out: Partial<Settings> = {};
  const check = (key: keyof Settings, ok: boolean) => {
    if (v[key] === undefined) return true;
    if (!ok) return false;
    (out as Record<string, unknown>)[key] = v[key];
    return true;
  };
  const valid =
    check("mode", v.mode === null || v.mode === "readAloud" || v.mode === "voiceOver") &&
    check("rate", typeof v.rate === "number") &&
    check("voiceURI", v.voiceURI === null || typeof v.voiceURI === "string") &&
    check("autoCapture", typeof v.autoCapture === "boolean") &&
    check("guidance", v.guidance === "full" || v.guidance === "minimal") &&
    check("sounds", typeof v.sounds === "boolean") &&
    check("theme", v.theme === "auto" || v.theme === "light" || v.theme === "dark" || v.theme === "contrast") &&
    check("modesLearned", typeof v.modesLearned === "boolean") &&
    check("pitch", typeof v.pitch === "number") &&
    check("volume", typeof v.volume === "number") &&
    check("talkUses", typeof v.talkUses === "number" && Number.isInteger(v.talkUses) && v.talkUses >= 0);
  return valid ? out : null;
}

/** Keeps a setting within its range, on a step of 0.1. */
function clampTenths(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.round(Math.min(max, Math.max(min, value)) * 10) / 10;
}

export function clampRate(rate: number): number {
  return clampTenths(rate, RATE_MIN, RATE_MAX, DEFAULT_SETTINGS.rate);
}

export function clampPitch(pitch: number): number {
  return clampTenths(pitch, PITCH_MIN, PITCH_MAX, DEFAULT_SETTINGS.pitch);
}

export function clampVolume(volume: number): number {
  return clampTenths(volume, VOLUME_MIN, VOLUME_MAX, DEFAULT_SETTINGS.volume);
}

/**
 * Loads settings, keeping every valid stored field and defaulting the rest. The reading speed is
 * the exception: it is 1 each time the app opens (docs/PROMPT-2.md section 6), so a speed someone
 * else set does not stay. Faster, Slower, and the slider last until the app is closed.
 */
export function loadSettings(storage: StorageLike | null): Settings {
  const stored = parseStoredSettings(readJson(storage, SETTINGS_KEY));
  if (!stored) return { ...DEFAULT_SETTINGS };
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  return { ...merged, rate: DEFAULT_SETTINGS.rate, pitch: clampPitch(merged.pitch), volume: clampVolume(merged.volume) };
}

export function saveSettings(storage: StorageLike | null, settings: Settings): void {
  writeJson(storage, SETTINGS_KEY, settings);
}

export function loadPasscode(storage: StorageLike | null): string | null {
  const value = readJson(storage, PASSCODE_KEY);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function savePasscode(storage: StorageLike | null, passcode: string): void {
  writeJson(storage, PASSCODE_KEY, passcode);
}

export function forgetPasscode(storage: StorageLike | null): void {
  removeKey(storage, PASSCODE_KEY);
}
