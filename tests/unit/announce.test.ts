// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Announcer, type Channel } from "@/lib/client/announce/announcer";
import { LiveRegions } from "@/lib/client/announce/liveRegions";
import { globalTimers } from "../helpers/fakeSpeech";

function setup(channel: Channel) {
  const status = document.createElement("div");
  const alert = document.createElement("div");
  const live = new LiveRegions(globalTimers);
  live.attach(status, alert);
  const speak = vi.fn(() => ({ id: 1, dropped: false }));
  const announcer = new Announcer({ speaker: { speak }, live, channel: () => channel, uiLang: "en" });
  return { status, alert, live, speak, announcer };
}

describe("Announcer", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("speaks in read-aloud mode and leaves the live regions empty", () => {
    const { status, alert, speak, announcer } = setup("speech");
    announcer.say("Got it. Reading.");
    announcer.say("Move left.", { priority: "low" });
    announcer.say("Error.", { alert: true });
    expect(speak).toHaveBeenNthCalledWith(1, "Got it. Reading.", { priority: "high", lang: "en" });
    expect(speak).toHaveBeenNthCalledWith(2, "Move left.", { priority: "low", lang: "en" });
    expect(status.textContent).toBe("");
    expect(alert.textContent).toBe("");
  });

  it("uses the live regions in VoiceOver mode and never speaks", () => {
    const { status, alert, speak, announcer } = setup("live");
    announcer.say("Got it. Reading.");
    expect(status.textContent).toBe("Got it. Reading.");
    announcer.say("I couldn't reach the reading service.", { alert: true });
    expect(alert.textContent).toBe("I couldn't reach the reading service.");
    expect(speak).not.toHaveBeenCalled();
  });

  it("drops a camera cue while VoiceOver is still reading the last message", () => {
    const { status, announcer } = setup("live");
    announcer.say("Lay the phone flat on the page, then lift it slowly.");
    expect(announcer.say("Move left.", { priority: "low" })).toBe(false);
    expect(status.textContent).toBe("Lay the phone flat on the page, then lift it slowly.");
    expect(announcer.lastMessage.get()).toBe("Lay the phone flat on the page, then lift it slowly.");
    vi.advanceTimersByTime(4000);
    expect(announcer.say("Move left.", { priority: "low" })).toBe(true);
    expect(status.textContent).toBe("Move left.");
  });

  it("remembers the last message for the visible status line", () => {
    const { announcer } = setup("live");
    announcer.say("Hold still.");
    expect(announcer.lastMessage.get()).toBe("Hold still.");
  });

  it("ignores empty messages", () => {
    const { speak, announcer } = setup("speech");
    announcer.say("   ");
    expect(speak).not.toHaveBeenCalled();
  });
});

describe("LiveRegions", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("clears and re-sets a repeated message so it is announced again", () => {
    const { status, live } = setup("live");
    live.status("Move left.");
    expect(status.textContent).toBe("Move left.");
    vi.advanceTimersByTime(2000);
    live.status("Move left.");
    expect(status.textContent).toBe("");
    vi.advanceTimersByTime(200);
    expect(status.textContent).toBe("Move left.");
  });

  it("spaces out messages that arrive together so neither is lost", () => {
    const { status, live } = setup("live");
    live.status("VoiceOver mode.");
    live.status("Enter the passcode, then press Continue.");
    expect(status.textContent).toBe("VoiceOver mode.");
    vi.advanceTimersByTime(800);
    expect(status.textContent).toBe("Enter the passcode, then press Continue.");
  });

  it("drops the oldest waiting messages when many pile up", () => {
    const { status, live } = setup("live");
    for (const text of ["one", "two", "three", "four", "five"]) live.status(text);
    const seen: string[] = [status.textContent ?? ""];
    for (let i = 0; i < 6; i++) {
      vi.advanceTimersByTime(800);
      if (seen.at(-1) !== status.textContent) seen.push(status.textContent ?? "");
    }
    expect(seen).toEqual(["one", "three", "four", "five"]);
  });

  it("never lets a low-priority message wait in line", () => {
    const { status, live } = setup("live");
    live.status("Got it. Reading.");
    live.status("Page 1 ready.");
    expect(live.status("Hold still.", { priority: "low" })).toBe(false);
    vi.advanceTimersByTime(20_000);
    expect(status.textContent).not.toBe("Hold still.");
  });

  it("clears an old message after a while so it is not found later", () => {
    const { status, live } = setup("live");
    live.status("Got it.");
    vi.advanceTimersByTime(11_000);
    expect(status.textContent).toBe("");
  });
});
