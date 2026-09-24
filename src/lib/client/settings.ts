import { z } from "zod";
import { readJson, removeKey, writeJson, type StorageLike } from "./storage";

/**
 * How the app talks to the user.
 * - `readAloud`: the app speaks everything itself (VoiceOver off).
 * - `voiceOver`: status goes to the live region for VoiceOver; the app voice stays silent unless
 *   "Play with app voice" is pressed for a document.
 */
export type Mode = "readAloud" | "voiceOver";

export interface Settings {
  mode: Mode | null;
  rate: number;
  voiceURI: string | null;
  autoCapture: boolean;
  guidance: "full" | "minimal";
  sounds: boolean;
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
};

const SETTINGS_KEY = "docreader.settings.v1";
const PASSCODE_KEY = "docreader.passcode.v1";

const StoredSettings = z
  .object({
    mode: z.enum(["readAloud", "voiceOver"]).nullable(),
    rate: z.number(),
    voiceURI: z.string().nullable(),
    autoCapture: z.boolean(),
    guidance: z.enum(["full", "minimal"]),
    sounds: z.boolean(),
  })
  .partial();

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_SETTINGS.rate;
  const clamped = Math.min(RATE_MAX, Math.max(RATE_MIN, rate));
  return Math.round(clamped * 10) / 10;
}

/** Loads settings, keeping every valid stored field and defaulting the rest. */
export function loadSettings(storage: StorageLike | null): Settings {
  const parsed = StoredSettings.safeParse(readJson(storage, SETTINGS_KEY));
  if (!parsed.success) return { ...DEFAULT_SETTINGS };
  const merged = { ...DEFAULT_SETTINGS, ...stripUndefined(parsed.data) };
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

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}
