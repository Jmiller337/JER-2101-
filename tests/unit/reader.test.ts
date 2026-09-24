import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { END_OF_DOCUMENT, Reader } from "@/lib/client/speech/reader";
import { Speaker } from "@/lib/client/speech/speaker";
import { FakeSpeechPort, globalTimers } from "../helpers/fakeSpeech";

function setup(rate = 1) {
  const port = new FakeSpeechPort();
  const settings = { rate };
  const speaker = new Speaker({
    port,
    timers: globalTimers,
    defaultLang: "en",
    defaultRate: () => settings.rate,
    voiceFor: () => null,
  });
  const tick = vi.fn();
  const reader = new Reader({ speaker, timers: globalTimers, rate: () => settings.rate, uiLang: "en", tick });
  return { port, speaker, reader, tick, settings };
}

/** A one-page document: title, a heading, and a two-sentence paragraph. */
function loadPageOne(reader: Reader, opts: { complete?: boolean } = {}) {
  reader.setLoading(true);
  reader.beginPage(1, { title: "A letter from the bank.", language: "en" });
  reader.addBlock(1, 0, "heading", "First National Bank");
  reader.addBlock(1, 1, "paragraph", "Your statement is ready. Please pay by Friday.");
  if (opts.complete !== false) {
    reader.completePage(1);
    reader.setLoading(false);
  }
}

describe("Reader", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reads the title, then each sentence, then says the document has ended", () => {
    const { port, reader } = setup();
    loadPageOne(reader);
    reader.play();
    port.finishAll();
    expect(port.texts).toEqual([
      "A letter from the bank.",
      "First National Bank",
      "Your statement is ready.",
      "Please pay by Friday.",
      END_OF_DOCUMENT,
    ]);
    expect(reader.store.get().status).toBe("ended");
  });

  it("starts speaking as soon as the title arrives and waits for more with ticks", () => {
    const { port, reader, tick } = setup();
    reader.setLoading(true);
    reader.play();
    expect(reader.store.get().status).toBe("waiting");
    vi.advanceTimersByTime(4100);
    expect(tick).toHaveBeenCalledTimes(2);
    reader.beginPage(1, { title: "A bill.", language: "en" });
    expect(port.speaking).toBe("A bill.");
    port.finish();
    expect(reader.store.get().status).toBe("waiting");
    reader.addBlock(1, 0, "paragraph", "Amount due: $5.");
    expect(port.speaking).toBe("Amount due: $5.");
    port.finish();
    reader.completePage(1);
    reader.setLoading(false);
    expect(port.speaking).toBe(END_OF_DOCUMENT);
  });

  it("pauses with a position report and resumes from the same sentence", () => {
    const { port, reader } = setup();
    loadPageOne(reader);
    reader.play();
    port.finish(); // title
    port.finish(); // heading
    expect(port.speaking).toBe("Your statement is ready.");
    reader.toggle();
    expect(reader.store.get().status).toBe("paused");
    expect(port.speaking).toBe("Paused. Paragraph 2 of 2.");
    port.finish();
    reader.toggle();
    expect(port.speaking).toBe("Resuming.");
    port.finish();
    expect(port.speaking).toBe("Your statement is ready.");
  });

  it("reports the page when there is more than one", () => {
    const { port, reader } = setup();
    loadPageOne(reader);
    reader.beginPage(2, { title: "Page two", language: "en" });
    reader.addBlock(2, 0, "paragraph", "More text.");
    reader.completePage(2);
    reader.play();
    port.finish();
    port.finish();
    reader.pause();
    expect(port.speaking).toBe("Paused. Paragraph 2 of 2, page 1 of 2.");
  });

  it("moves by sentence and says when it reaches the start", () => {
    const { port, reader } = setup();
    loadPageOne(reader);
    reader.play();
    reader.next();
    expect(port.speaking).toBe("First National Bank");
    reader.next();
    expect(port.speaking).toBe("Your statement is ready.");
    reader.previous();
    expect(port.speaking).toBe("First National Bank");
    reader.previous();
    reader.previous();
    expect(port.speaking).toBe("Start of document.");
    port.finish();
    expect(port.speaking).toBe("A letter from the bank.");
  });

  it("moves by paragraph", () => {
    const { port, reader } = setup();
    loadPageOne(reader);
    reader.play();
    reader.nextParagraph();
    expect(port.speaking).toBe("First National Bank");
    reader.nextParagraph();
    expect(port.speaking).toBe("Your statement is ready.");
    reader.next();
    expect(port.speaking).toBe("Please pay by Friday.");
    reader.previousParagraph();
    expect(port.speaking).toBe("First National Bank");
    reader.nextParagraph();
    reader.nextParagraph();
    expect(port.speaking).toBe(END_OF_DOCUMENT);
  });

  it("announces a speed change and repeats the current sentence at the new rate", () => {
    const { port, reader, settings } = setup();
    loadPageOne(reader);
    reader.play();
    port.finish();
    settings.rate = 1.5;
    reader.rateChanged();
    expect(port.speaking).toBe("Speed 1.5.");
    port.finish();
    expect(port.log.at(-1)).toMatchObject({ text: "First National Bank", rate: 1.5 });
  });

  it("spells the current sentence slowly and then pauses on it", () => {
    const { port, reader } = setup();
    reader.beginPage(1, { title: "", language: "en" });
    reader.addBlock(1, 0, "paragraph", "Pay 12.");
    reader.completePage(1);
    reader.play();
    reader.spell();
    expect(port.speaking).toBe("capital P, A, Y, space, 1, 2, dot");
    expect(port.log.at(-1)!.rate).toBeCloseTo(0.8);
    port.finish();
    expect(reader.store.get().status).toBe("paused");
    reader.toggle();
    port.finish(); // "Resuming."
    expect(port.speaking).toBe("Pay 12.");
  });

  it("pauses silently when an announcement interrupts it", () => {
    const { port, reader, speaker } = setup();
    loadPageOne(reader);
    reader.play();
    speaker.speak("I couldn't reach the reading service.", { priority: "high" });
    expect(reader.store.get().status).toBe("paused");
    port.finish();
    expect(port.current).toBeNull();
  });

  it("reads into a page added while reading, announcing the boundary", () => {
    const { port, reader } = setup();
    loadPageOne(reader);
    reader.play();
    port.finish();
    port.finish();
    reader.suspend(); // Add page pressed
    reader.setLoading(true);
    reader.continueAfterAddPage(2);
    expect(port.speaking).toBe("Your statement is ready.");
    reader.beginPage(2, { title: "Page two", language: "en" });
    reader.addBlock(2, 0, "paragraph", "Second page text.");
    reader.completePage(2);
    reader.setLoading(false);
    port.finishAll();
    expect(port.texts.slice(-4)).toEqual(["Please pay by Friday.", "Page 2.", "Second page text.", END_OF_DOCUMENT]);
  });

  it("says 'Page 2 added' when the document had already ended", () => {
    const { port, reader } = setup();
    loadPageOne(reader);
    reader.play();
    port.finishAll();
    expect(reader.store.get().status).toBe("ended");
    reader.setLoading(true);
    reader.continueAfterAddPage(2);
    expect(reader.store.get().status).toBe("waiting");
    reader.beginPage(2, { title: "Page two", language: "en", warning: "The bottom of the page is cut off." });
    expect(port.speaking).toBe("Page 2 added.");
    port.finish();
    expect(port.speaking).toBe("The bottom of the page is cut off.");
  });

  it("waits at a page boundary until the earlier page has finished arriving", () => {
    const { port, reader } = setup();
    loadPageOne(reader, { complete: false });
    reader.beginPage(2, { title: "Page two", language: "en" });
    reader.addBlock(2, 0, "paragraph", "Page two text.");
    reader.play();
    port.finishAll(); // title, heading, and the two sentences of page 1 so far
    expect(reader.store.get().status).toBe("waiting");
    expect(port.texts).not.toContain("Page 2.");
    // The rest of page 1 arrives: it is read before moving on.
    reader.addBlock(1, 2, "paragraph", "Late page one text.");
    expect(port.speaking).toBe("Late page one text.");
    reader.completePage(1);
    port.finish();
    expect(port.speaking).toBe("Page 2.");
    port.finish();
    expect(port.speaking).toBe("Page two text.");
  });

  it("says a notice and carries on from the same sentence", () => {
    const { port, reader } = setup();
    loadPageOne(reader);
    reader.play();
    port.finish(); // title
    reader.notice("That is the fastest speed.");
    expect(port.speaking).toBe("That is the fastest speed.");
    port.finish();
    expect(port.speaking).toBe("First National Bank");
    expect(reader.store.get().status).toBe("playing");
  });

  it("removes a page to retake it and keeps the position sensible", () => {
    const { port, reader } = setup();
    loadPageOne(reader);
    reader.beginPage(2, { title: "Page two", language: "en" });
    reader.addBlock(2, 0, "paragraph", "Page two text.");
    reader.completePage(2);
    reader.play();
    port.finishAll();
    reader.removePage(2);
    expect(reader.store.get().itemCount).toBe(4);
    reader.previous();
    expect(port.speaking).toBe("Please pay by Friday.");
  });

  it("stops instead of racing ahead when speech is not allowed", () => {
    const { port, reader } = setup();
    loadPageOne(reader);
    reader.play();
    port.fail("not-allowed");
    expect(reader.store.get().status).toBe("paused");
    expect(port.current).toBeNull();
  });

  it("plays again from the start after the end", () => {
    const { port, reader } = setup();
    loadPageOne(reader);
    reader.play();
    port.finishAll();
    reader.toggle();
    expect(port.speaking).toBe("A letter from the bank.");
  });

  it("speaks markers as words", () => {
    const { port, reader } = setup();
    reader.beginPage(1, { title: "", language: "en" });
    reader.addBlock(1, 0, "paragraph", "Signed by Smithson [?] and [unclear].");
    reader.completePage(1);
    reader.play();
    expect(port.speaking).toBe("Signed by Smithson, possibly, and unclear word.");
  });

  it("uses the page language for text and the interface language for its own sentences", () => {
    const { port, reader } = setup();
    reader.beginPage(1, { title: "A letter in Spanish.", language: "es" });
    reader.addBlock(1, 0, "paragraph", "Hola.");
    reader.completePage(1);
    reader.play();
    expect(port.log.at(-1)).toMatchObject({ lang: "en" });
    port.finish();
    expect(port.log.at(-1)).toMatchObject({ text: "Hola.", lang: "es" });
  });
});
