import { describe, expect, it } from "vitest";
import { ASK_SYSTEM_PROMPT, READ_PDF_SYSTEM_PROMPT, READ_SYSTEM_PROMPT, readPdfUserText, readUserText } from "@/lib/server/prompts";

/** Where the prompt starts describing the page's blocks. */
const BLOCK_START = '{"type":"block"';

// Guards on the reading rules the owner chose: filler words may be restored, facts never.
describe("reading prompts", () => {
  for (const [name, prompt] of [
    ["photo", READ_SYSTEM_PROMPT],
    ["PDF", READ_PDF_SYSTEM_PROMPT],
  ] as const) {
    it(`the ${name} prompt allows filler words to be filled in but never facts`, () => {
      expect(prompt).toContain("You may silently fill in small filler words");
      expect(prompt).toContain("Never fill in facts.");
      expect(prompt).toContain("followed by [?]");
      expect(prompt).toContain("write [unclear]");
      expect(prompt).toMatch(/not, no, never/);
      expect(prompt).toContain("medicine names and doses");
    });

    it(`the ${name} prompt still reads everything and never remarks on the photo`, () => {
      expect(prompt).toContain("The blocks must contain all of the words.");
      expect(prompt).not.toMatch(/"warning"/);
    });
  }

  for (const [name, prompt] of [
    ["photo", READ_SYSTEM_PROMPT],
    ["PDF", READ_PDF_SYSTEM_PROMPT],
  ] as const) {
    // docs/PROMPT-2.md section 3: answer first, only from the page, then the full text for Play.
    it(`the ${name} prompt writes the answer line before any block, from the page only`, () => {
      expect(prompt).toContain('line 2 is always the answer line, before any block');
      expect(prompt).toContain('{"type":"answer","text":"..."}');
      expect(prompt).toContain("using only what is written");
      expect(prompt).toContain('no "Sure", no repeating the question, no "the document says"');
      expect(prompt).toContain("I can't find <what was asked>");
      expect(prompt).toContain("Never answer with a guess, with arithmetic, or with what documents like this usually say");
      expect(prompt).toContain('put "possibly" before it');
      expect(prompt.indexOf("the answer line")).toBeLessThan(prompt.indexOf(BLOCK_START));
    });

    it(`the ${name} prompt names the headline fact for each kind of document`, () => {
      for (const kind of ["receipt:", "bill:", "credit card or bank statement:", "letter or notice:", "form:", "prescription or medical paper:"]) {
        expect(prompt).toContain(kind);
      }
      expect(prompt).toContain("without doses");
    });
  }

  it("the photo prompt describes pictures and screenshots instead of giving up on them", () => {
    expect(READ_SYSTEM_PROMPT).toContain("describe what it shows in one or two plain sentences");
    expect(READ_SYSTEM_PROMPT).toContain("never guess who they are");
    expect(READ_SYSTEM_PROMPT).not.toContain("shows no document at all");
  });

  it("the instruction carries the question, or says none was asked", () => {
    expect(readUserText(1, null, "the amount due")).toContain('the listener asked: "the amount due"');
    expect(readUserText(1, null)).toContain("No question was asked");
    expect(readPdfUserText(null, 'the "total"')).toContain(`the listener asked: "the 'total'"`);
  });

  it("the question prompt answers briefly and says plainly when something is not there", () => {
    expect(ASK_SYSTEM_PROMPT).toContain("I can't find <what was asked> in this document.");
    expect(ASK_SYSTEM_PROMPT).toContain('no "Sure"');
  });

  it("the question prompt says when a fact was hard to read", () => {
    expect(ASK_SYSTEM_PROMPT).toContain("say that it was hard to read");
  });
});
