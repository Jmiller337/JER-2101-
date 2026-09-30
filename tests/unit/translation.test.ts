import { describe, expect, it } from "vitest";
import { serverEnv } from "@/lib/server/config";
import { ModelOutputParser } from "@/lib/server/modelOutput";
import {
  READ_PDF_SYSTEM_PROMPT,
  READ_SYSTEM_PROMPT,
  readPdfSystemPrompt,
  readSystemPrompt,
  translationRules,
} from "@/lib/server/prompts";
import { parseReadEvent, type ReadEvent } from "@/lib/shared/protocol";
import { parseTranslateFrom, translationNote } from "@/lib/shared/translation";

// Translating French documents into English: built, and switched off unless TRANSLATE_FROM is set.

describe("the translation switch", () => {
  it("is off unless TRANSLATE_FROM names a language that can be translated", () => {
    expect(serverEnv({}).translateFrom).toEqual([]);
    expect(serverEnv({ TRANSLATE_FROM: "" }).translateFrom).toEqual([]);
    expect(serverEnv({ TRANSLATE_FROM: "fr" }).translateFrom).toEqual(["fr"]);
    expect(parseTranslateFrom(" FR-ca , fr, de, klingon ")).toEqual(["fr"]);
    expect(parseTranslateFrom("de")).toEqual([]);
  });

  it("names the language in plain words", () => {
    expect(translationNote("fr")).toBe("Translated from French.");
    expect(translationNote("fr-CA")).toBe("Translated from French.");
  });
});

describe("the reading prompts with translation", () => {
  it("are exactly as before while translation is off", () => {
    expect(readSystemPrompt()).toBe(READ_SYSTEM_PROMPT);
    expect(readSystemPrompt([])).toBe(READ_SYSTEM_PROMPT);
    expect(readPdfSystemPrompt([])).toBe(READ_PDF_SYSTEM_PROMPT);
    for (const prompt of [READ_SYSTEM_PROMPT, READ_PDF_SYSTEM_PROMPT]) {
      expect(prompt).not.toContain("translatedFrom");
      expect(prompt).toContain("Do not comment, translate, or correct the document. Keep the original language.");
    }
  });

  for (const [name, prompt, unit] of [
    ["photo", readSystemPrompt(["fr"]), "page"],
    ["PDF", readPdfSystemPrompt(["fr"]), "document"],
  ] as const) {
    it(`the ${name} prompt translates French into English, whole and faithful, before its last line`, () => {
      const rules = translationRules(["fr"], unit);
      expect(prompt).toContain(rules);
      expect(prompt.indexOf(rules)).toBeLessThan(prompt.indexOf("Finish with:"));
      expect(prompt).toMatch(/Finish with: \{"type":"done","blocks":<number of block lines>\}$/);
      expect(rules).toContain(`When the ${unit}'s main language is French, write its text in English`);
      expect(rules).toContain(`set "language" to "en" and add "translatedFrom"`);
      expect(rules).toContain(`A ${unit} in any other language is transcribed as usual`);
      expect(rules).toContain("Do not summarize, shorten, explain, or leave anything out.");
    });

    it(`the ${name} prompt keeps every fact as printed in a translation`, () => {
      const rules = translationRules(["fr"], unit);
      for (const fact of ["names of people", "street addresses", "amounts, prices, and currencies", "account, reference, and policy numbers", "email and web addresses"]) {
        expect(rules).toContain(fact);
      }
      expect(rules).toContain('"le 28 octobre 2026" is "October 28, 2026"');
      expect(rules).toMatch(/Translate meaning-changing words exactly: not, no, never/);
      expect(rules).toContain("kept in the original language rather than guessed");
      expect(rules).toContain("The [?] and [unclear] markers stay where they are.");
      expect(rules).toContain("Never translate a word you could not read");
      // The rules that protect facts still apply to a translated page.
      expect(prompt).toContain("Never fill in facts.");
      expect(rules).toContain("every other rule still applies");
    });
  }

  it("lists several languages in plain words", () => {
    expect(translationRules(["fr", "xx"], "page")).toContain("main language is French or xx,");
  });
});

/** Runs model output through the parser with translation from the given languages switched on. */
function parse(translateFrom: string[], ...objects: unknown[]): ReadEvent[] {
  const parser = new ModelOutputParser({ translateFrom });
  const events = [...parser.push(objects.map((o) => JSON.stringify(o)).join("\n") + "\n"), ...parser.finish()];
  for (const event of events) expect(parseReadEvent(event)).toEqual(event);
  return events;
}

describe("a translated page's meta line", () => {
  const META = { type: "meta", status: "ok", language: "en", kind: "letter", title: "A letter from the City of Lyon" };
  const BLOCK = { type: "block", kind: "paragraph", text: "Your tax is due." };

  it("says which language it came from when translation from it is switched on", () => {
    const [meta] = parse(["fr"], { ...META, translatedFrom: "fr-FR" }, BLOCK);
    expect(meta).toEqual({ ...META, translatedFrom: "fr" });
  });

  it("never says so while translation is off, or for a language that is not switched on", () => {
    expect(parse([], { ...META, translatedFrom: "fr" }, BLOCK)[0]).toEqual(META);
    expect(parse(["fr"], { ...META, translatedFrom: "de" }, BLOCK)[0]).toEqual(META);
  });

  it("ignores a page that says it was translated into its own language, or could not be read", () => {
    expect(parse(["fr"], { ...META, language: "fr", translatedFrom: "fr" }, BLOCK)[0]).toEqual({ ...META, language: "fr" });
    const retry = { type: "meta", status: "retry", language: "en", kind: "other", title: "", problem: "Too dark.", translatedFrom: "fr" };
    expect(parse(["fr"], retry)[0]).not.toHaveProperty("translatedFrom");
  });

  it("is checked by the phone like every other field", () => {
    expect(parseReadEvent({ ...META, translatedFrom: "fr" })).toEqual({ ...META, translatedFrom: "fr" });
    expect(parseReadEvent({ ...META, translatedFrom: 3 })).toBeNull();
    expect(parseReadEvent({ ...META, translatedFrom: "f" })).toBeNull();
  });
});
