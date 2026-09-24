import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Speaker } from "@/lib/client/speech/speaker";
import { StreamingSpeech } from "@/lib/client/speech/streamingSpeech";
import { FakeSpeechPort, globalTimers } from "../helpers/fakeSpeech";

function setup() {
  const port = new FakeSpeechPort();
  const speaker = new Speaker({ port, timers: globalTimers, defaultLang: "en", defaultRate: () => 1, voiceFor: () => null });
  const done = vi.fn();
  const speech = new StreamingSpeech(speaker, { lang: "en", rate: () => 1, onDone: done });
  return { port, speaker, speech, done };
}

describe("StreamingSpeech", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("speaks each sentence as soon as it is complete", () => {
    const { port, speech } = setup();
    speech.push("You owe 84 dol");
    expect(port.speaking).toBeNull();
    speech.push("lars. It is due on Octo");
    expect(port.speaking).toBe("You owe 84 dollars.");
    port.finish();
    expect(port.speaking).toBeNull();
    speech.push("ber 28.");
    speech.finish();
    expect(port.speaking).toBe("It is due on October 28.");
  });

  it("calls onDone after the last sentence has been spoken", () => {
    const { port, speech, done } = setup();
    speech.push("One. Two.");
    speech.finish();
    port.finishAll();
    expect(port.texts).toEqual(["One.", "Two."]);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("stops quietly when stopped or interrupted", () => {
    const { port, speaker, speech, done } = setup();
    speech.push("One. Two. Three.");
    speaker.speak("Error.", { priority: "high" });
    port.finishAll();
    speech.finish();
    expect(port.texts).toEqual(["One.", "Error."]);
    expect(done).not.toHaveBeenCalled();
  });
});
