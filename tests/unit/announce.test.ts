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
  const speak = vi.fn();
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
    live.status("Move left.");
    expect(status.textContent).toBe("");
    vi.advanceTimersByTime(200);
    expect(status.textContent).toBe("Move left.");
  });

  it("replaces text instead of appending", () => {
    const { status, live } = setup("live");
    live.status("One.");
    live.status("Two.");
    expect(status.textContent).toBe("Two.");
  });

  it("clears an old message after a while so it is not found later", () => {
    const { status, live } = setup("live");
    live.status("Got it.");
    vi.advanceTimersByTime(11_000);
    expect(status.textContent).toBe("");
  });
});
