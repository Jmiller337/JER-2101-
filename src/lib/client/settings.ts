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
}

export const RATE_MIN = 0.7;
export const RATE_MAX = 2.0;
export const RATE_STEP = 0.1;

export const DEFAULT_SETTINGS: Settings = {
  mode: null,
  rate: 1,
  voiceURI: null,
  autoCapture: true,
  guidance: "full",
  sounds: true,
  theme: "auto",
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
    check("theme", v.theme === "auto" || v.theme === "light" || v.theme === "dark" || v.theme === "contrast");
  return valid ? out : null;
}

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_SETTINGS.rate;
  const clamped = Math.min(RATE_MAX, Math.max(RATE_MIN, rate));
  return Math.round(clamped * 10) / 10;
}

/** Loads settings, keeping every valid stored field and defaulting the rest. */
export function loadSettings(storage: StorageLike | null): Settings {
  const stored = parseStoredSettings(readJson(storage, SETTINGS_KEY));
  if (!stored) return { ...DEFAULT_SETTINGS };
  const merged = { ...DEFAULT_SETTINGS, ...stored };
  return { ...merged, rate: clampRate(merged.rate) };
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
