import { describe, expect, it } from "vitest";
import {
  clampRate,
  DEFAULT_SETTINGS,
  forgetPasscode,
  loadPasscode,
  loadSettings,
  savePasscode,
  saveSettings,
} from "@/lib/client/settings";
import type { VoiceInfo } from "@/lib/client/speech/port";
import { betterVoiceAvailable, pickVoice, voiceQuality, voicesForLanguage } from "@/lib/client/speech/voices";
import { MemoryStorage } from "@/lib/client/storage";

function voice(name: string, lang: string, extra: Partial<VoiceInfo> = {}): VoiceInfo {
  return { name, lang, voiceURI: `uri.${name}`, default: false, localService: true, ...extra };
}

const VOICES = [
  voice("Samantha", "en-US", { voiceURI: "com.apple.voice.compact.en-US.Samantha", default: true }),
  voice("Ava (Premium)", "en-US", { voiceURI: "com.apple.voice.premium.en-US.Ava" }),
  voice("Daniel (Enhanced)", "en-GB", { voiceURI: "com.apple.voice.enhanced.en-GB.Daniel" }),
  voice("Bad News", "en-US", { voiceURI: "com.apple.speech.synthesis.voice.BadNews" }),
  voice("Mónica", "es-ES"),
  voice("Paulina (Enhanced)", "es-MX"),
];

describe("pickVoice", () => {
  it("prefers a Premium or Enhanced voice for the language", () => {
    expect(pickVoice(VOICES, "en-US", null)?.name).toBe("Ava (Premium)");
    expect(pickVoice(VOICES, "es", null)?.name).toBe("Paulina (Enhanced)");
  });

  it("uses the chosen voice when it speaks the language", () => {
    expect(pickVoice(VOICES, "en-US", "com.apple.voice.compact.en-US.Samantha")?.name).toBe("Samantha");
  });

  it("ignores a chosen voice from another language", () => {
    expect(pickVoice(VOICES, "es-MX", "com.apple.voice.compact.en-US.Samantha")?.name).toBe("Paulina (Enhanced)");
  });

  it("returns null when no voice speaks the language", () => {
    expect(pickVoice(VOICES, "fr-FR", null)).toBeNull();
  });

  it("never picks a novelty voice when a real one exists", () => {
    const onlyNovelty = [voice("Bad News", "en-US", { default: true }), voice("Karen", "en-AU")];
    expect(pickVoice(onlyNovelty, "en-US", null)?.name).toBe("Karen");
  });

  it("lists voices for Settings, best first, without novelty voices", () => {
    expect(voicesForLanguage(VOICES, "en-US").map((v) => v.name)).toEqual([
      "Ava (Premium)",
      "Daniel (Enhanced)",
      "Samantha",
    ]);
  });
});

describe("voice quality", () => {
  const v = (name: string, lang = "en-US"): VoiceInfo => ({ name, lang, voiceURI: `uri.${name}`, default: false, localService: true });

  it("rates Premium above Enhanced above the basic voice", () => {
    expect(voiceQuality(v("Ava (Premium)"))).toBe("premium");
    expect(voiceQuality(v("Samantha (Enhanced)"))).toBe("enhanced");
    expect(voiceQuality(v("Samantha"))).toBe("standard");
    const picked = pickVoice([v("Samantha"), v("Samantha (Enhanced)"), v("Ava (Premium)")], "en-US", null);
    expect(picked?.name).toBe("Ava (Premium)");
  });

  it("never picks an old synthetic voice automatically but keeps it in the list", () => {
    expect(pickVoice([v("Fred"), v("Samantha")], "en-US", null)?.name).toBe("Samantha");
    expect(voicesForLanguage([v("Fred"), v("Samantha")], "en-US").map((x) => x.name)).toEqual(["Fred", "Samantha"]);
  });

  it("says a better voice is available only when just basic voices speak the language", () => {
    expect(betterVoiceAvailable([v("Samantha"), v("Fred")], "en-US")).toBe(true);
    expect(betterVoiceAvailable([v("Samantha"), v("Ava (Premium)")], "en-US")).toBe(false);
    expect(betterVoiceAvailable([v("Monica", "es-ES")], "en-US")).toBe(false);
  });
});

describe("settings", () => {
  it("keeps a valid colour theme and defaults to Light", () => {
    const storage = new MemoryStorage();
    expect(loadSettings(storage).theme).toBe("light");
    saveSettings(storage, { ...DEFAULT_SETTINGS, theme: "contrast" });
    expect(loadSettings(storage).theme).toBe("contrast");
    storage.setItem("docreader.settings.v1", JSON.stringify({ ...DEFAULT_SETTINGS, theme: "purple" }));
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips and clamps the rate", () => {
    const storage = new MemoryStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, mode: "voiceOver", rate: 1.5, sounds: false });
    expect(loadSettings(storage)).toEqual({ ...DEFAULT_SETTINGS, mode: "voiceOver", rate: 1.5, sounds: false });
    expect(clampRate(5)).toBe(2);
    expect(clampRate(0.1)).toBe(0.7);
    expect(clampRate(1.26)).toBe(1.3);
    expect(clampRate(Number.NaN)).toBe(1);
  });

  it("falls back to defaults for missing or corrupt data", () => {
    const storage = new MemoryStorage();
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    storage.setItem("docreader.settings.v1", "{not json");
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    storage.setItem("docreader.settings.v1", JSON.stringify({ rate: 9, mode: "bogus" }));
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
    storage.setItem("docreader.settings.v1", JSON.stringify({ rate: 9 }));
    expect(loadSettings(storage).rate).toBe(2);
  });

  it("works with no storage at all", () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(null, DEFAULT_SETTINGS)).not.toThrow();
    expect(loadPasscode(null)).toBeNull();
  });

  it("stores and forgets the passcode", () => {
    const storage = new MemoryStorage();
    savePasscode(storage, "secret");
    expect(loadPasscode(storage)).toBe("secret");
    forgetPasscode(storage);
    expect(loadPasscode(storage)).toBeNull();
  });
});
