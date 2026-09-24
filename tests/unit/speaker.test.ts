import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Speaker } from "@/lib/client/speech/speaker";
import { FakeSpeechPort, globalTimers } from "../helpers/fakeSpeech";

function setup() {
  const port = new FakeSpeechPort();
  const speaker = new Speaker({
    port,
    timers: globalTimers,
    defaultLang: "en",
    defaultRate: () => 1,
    voiceFor: (lang) => (lang === "en" ? "voice-en" : null),
  });
  return { port, speaker };
}

describe("Speaker", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("speaks with the chosen voice, language, and rate", () => {
    const { port, speaker } = setup();
    speaker.speak("Hello.", { priority: "high" });
    expect(port.log[0]).toEqual({ text: "Hello.", lang: "en", rate: 1, voiceURI: "voice-en" });
  });

  it("lets a high announcement interrupt reading and tells the reader", () => {
    const { port, speaker } = setup();
    const interrupted = vi.fn();
    const ended = vi.fn();
    speaker.speak("Reading a sentence.", { priority: "content", onInterrupted: interrupted, onEnd: ended });
    speaker.speak("Error.", { priority: "high" });
    expect(interrupted).toHaveBeenCalledTimes(1);
    expect(ended).not.toHaveBeenCalled();
    expect(port.speaking).toBe("Error.");
  });

  it("queues content behind an announcement", () => {
    const { port, speaker } = setup();
    speaker.speak("Got it. Reading.", { priority: "high" });
    speaker.speak("A letter from the bank.", { priority: "content" });
    expect(port.speaking).toBe("Got it. Reading.");
    port.finish();
    expect(port.speaking).toBe("A letter from the bank.");
  });

  it("queues a second announcement after the first, ahead of content", () => {
    const { port, speaker } = setup();
    speaker.speak("One.", { priority: "high" });
    speaker.speak("Content.", { priority: "content" });
    speaker.speak("Two.", { priority: "high" });
    port.finishAll();
    expect(port.texts).toEqual(["One.", "Two.", "Content."]);
  });

  it("drops a low-priority cue while anything else is speaking", () => {
    const { port, speaker } = setup();
    speaker.speak("Intro sentence.", { priority: "high" });
    const handle = speaker.speak("Move left.", { priority: "low" });
    expect(handle.dropped).toBe(true);
    port.finishAll();
    expect(port.texts).toEqual(["Intro sentence."]);
  });

  it("lets reading replace a cue", () => {
    const { port, speaker } = setup();
    speaker.speak("Hold still.", { priority: "low" });
    speaker.speak("Title.", { priority: "content" });
    expect(port.speaking).toBe("Title.");
  });

  it("ignores events from cancelled utterances", () => {
    const { port, speaker } = setup();
    const ended = vi.fn();
    speaker.speak("First.", { priority: "content", onEnd: ended });
    speaker.cancelContent();
    expect(ended).not.toHaveBeenCalled();
    expect(speaker.busy).toBe(false);
    expect(port.cancelCount).toBe(1);
  });

  it("gives up on an utterance that never ends and moves on", () => {
    const { port, speaker } = setup();
    const ended = vi.fn();
    speaker.speak("Stuck sentence.", { priority: "content", onEnd: ended });
    speaker.speak("Next.", { priority: "high" });
    // The high job interrupted the stuck one; now test a stuck high job.
    expect(port.speaking).toBe("Next.");
    vi.advanceTimersByTime(60_000);
    expect(speaker.busy).toBe(false);
  });

  it("calls onEnd after the watchdog fires", () => {
    const { speaker } = setup();
    const ended = vi.fn();
    speaker.speak("Twelve chars", { priority: "content", onEnd: ended });
    vi.advanceTimersByTime(5000);
    expect(ended).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("reports engine errors to onError, and treats interruptions as ends", () => {
    const { port, speaker } = setup();
    const errored = vi.fn();
    speaker.speak("A.", { priority: "content", onError: errored });
    port.fail("not-allowed");
    expect(errored).toHaveBeenCalledWith("not-allowed");
    const ended = vi.fn();
    speaker.speak("B.", { priority: "content", onEnd: ended });
    port.fail("interrupted");
    expect(ended).toHaveBeenCalledTimes(1);
  });

  it("finishes empty text immediately without speaking", () => {
    const { port, speaker } = setup();
    const ended = vi.fn();
    speaker.speak("   ", { priority: "content", onEnd: ended });
    vi.runAllTimers();
    expect(ended).toHaveBeenCalled();
    expect(port.log).toHaveLength(0);
  });

  it("cancelAll silences everything without callbacks", () => {
    const { port, speaker } = setup();
    const interrupted = vi.fn();
    speaker.speak("One.", { priority: "high" });
    speaker.speak("Two.", { priority: "content", onInterrupted: interrupted });
    speaker.cancelAll();
    expect(speaker.busy).toBe(false);
    expect(interrupted).not.toHaveBeenCalled();
    expect(port.current).toBeNull();
  });
});
