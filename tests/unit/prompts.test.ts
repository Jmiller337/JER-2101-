import { describe, expect, it } from "vitest";
import { ASK_SYSTEM_PROMPT, READ_PDF_SYSTEM_PROMPT, READ_SYSTEM_PROMPT } from "@/lib/server/prompts";

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

  it("the question prompt says when a fact was hard to read", () => {
    expect(ASK_SYSTEM_PROMPT).toContain("say that it was hard to read");
  });
});
