import { describe, expect, it } from "vitest";
import { splitMarkers, toReadableText } from "@/lib/client/text/markers";
import { speedAnnouncement, toSpoken } from "@/lib/client/text/normalize";
import { chunkForSpeech, splitSentences } from "@/lib/client/text/sentences";
import { spellChunks, spellTokens } from "@/lib/client/text/spell";

describe("splitSentences", () => {
  it("splits ordinary sentences", () => {
    expect(splitSentences("Your bill is ready. Please pay by Friday! Questions?")).toEqual([
      "Your bill is ready.",
      "Please pay by Friday!",
      "Questions?",
    ]);
  });

  it("keeps titles, initials, and abbreviations inside the sentence", () => {
    expect(splitSentences("Dear Mr. Smith, J. R. Jones called at 8 a.m. today. Call back.")).toEqual([
      "Dear Mr. Smith, J. R. Jones called at 8 a.m. today.",
      "Call back.",
    ]);
  });

  it("does not break on the question mark inside a doubt marker", () => {
    expect(splitSentences("Signed by Smithson [?] on Monday. Thanks.")).toEqual([
      "Signed by Smithson [?] on Monday.",
      "Thanks.",
    ]);
  });

  it("keeps a leading list number with its item", () => {
    expect(splitSentences("1. Pay online. It is fast.")).toEqual(["1. Pay online.", "It is fast."]);
  });

  it("keeps amounts and decimals together", () => {
    expect(splitSentences("Amount due: $45.10. Thank you.")).toEqual(["Amount due: $45.10.", "Thank you."]);
  });

  it("returns nothing for empty text", () => {
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("chunkForSpeech", () => {
  it("leaves short sentences alone", () => {
    expect(chunkForSpeech("Short.")).toEqual(["Short."]);
  });

  it("splits long sentences at commas without splitting numbers", () => {
    const sentence =
      "The total of 1,234 dollars includes water, sewer, trash, and a late fee, which was added because the previous payment of 300 dollars arrived after the due date, as shown on the enclosed statement for your records.";
    const chunks = chunkForSpeech(sentence, 80);
    expect(chunks.every((c) => c.length <= 80)).toBe(true);
    expect(chunks.join(" ")).toBe(sentence);
    expect(chunks.some((c) => c.includes("1,234"))).toBe(true);
  });

  it("splits at spaces when there is no punctuation", () => {
    const sentence = "word ".repeat(60).trim();
    const chunks = chunkForSpeech(sentence, 50);
    expect(chunks.every((c) => c.length <= 50)).toBe(true);
    expect(chunks.join(" ")).toBe(sentence);
  });
});

describe("toSpoken", () => {
  it("speaks unclear and doubtful words", () => {
    expect(toSpoken("Pay [unclear] now.")).toBe("Pay unclear word now.");
    expect(toSpoken("Signed, Smithson [?].")).toBe("Signed, Smithson, possibly.");
    expect(toSpoken("Smithson [?] wrote this")).toBe("Smithson, possibly, wrote this");
    expect(toSpoken("Dear Smithson [?],")).toBe("Dear Smithson, possibly,".replace(/,$/, ""));
    expect(toSpoken("[unclear] [unclear] street")).toBe("unclear word unclear word street");
  });

  it("collapses whitespace and tidies punctuation", () => {
    expect(toSpoken("  Hello   world  .  ")).toBe("Hello world.");
  });
});

describe("markers", () => {
  it("splits text into runs and markers", () => {
    expect(splitMarkers("A [unclear] B [?] C")).toEqual([
      { type: "text", text: "A " },
      { type: "unclear" },
      { type: "text", text: " B" },
      { type: "doubt" },
      { type: "text", text: " C" },
    ]);
  });

  it("writes readable text for VoiceOver users", () => {
    expect(toReadableText("Pay [unclear] to Smithson [?].")).toBe("Pay (unclear word) to Smithson (possibly).");
  });
});

describe("spelling", () => {
  it("names capitals, letters, digits, spaces, and punctuation", () => {
    expect(spellTokens("Pay 12.")).toEqual(["capital P", "A", "Y", "space", "1", "2", "dot"]);
  });

  it("handles markers and unknown symbols", () => {
    expect(spellTokens("a [unclear] b [?]")).toEqual(["A", "unclear word", "space", "B"]);
    expect(spellTokens("$5")).toEqual(["dollar sign", "5"]);
  });

  it("groups tokens into short utterances", () => {
    expect(spellChunks("abcdef", 4)).toEqual(["A, B, C, D", "E, F"]);
  });
});

describe("speedAnnouncement", () => {
  it("uses one decimal place", () => {
    expect(speedAnnouncement(1.5)).toBe("Speed 1.5.");
    expect(speedAnnouncement(1)).toBe("Speed 1.0.");
  });
});
