import { describe, expect, it } from "vitest";
import { FRAMING_SOUNDS, FramingSounds, tickIntervalMs, type Situation } from "@/lib/client/vision/framing";

describe("framing sounds", () => {
  it("ticks faster as the page fills more of the frame", () => {
    expect(tickIntervalMs(0)).toBe(FRAMING_SOUNDS.slowestMs);
    expect(tickIntervalMs(FRAMING_SOUNDS.fromCoverage)).toBe(FRAMING_SOUNDS.slowestMs);
    expect(tickIntervalMs(0.2)).toBeLessThan(tickIntervalMs(0.1));
    expect(tickIntervalMs(0.4)).toBeLessThan(tickIntervalMs(0.2));
    expect(tickIntervalMs(FRAMING_SOUNDS.fullCoverage)).toBe(FRAMING_SOUNDS.fastestMs);
    expect(tickIntervalMs(0.9)).toBe(FRAMING_SOUNDS.fastestMs);
  });

  it("ticks at the interval for the page's size while a page is in view", () => {
    const sounds = new FramingSounds();
    const cut: Situation = { kind: "cutOff", edges: { left: true, right: false, top: false, bottom: false } };
    const ticks = (coverage: number) => {
      const at: number[] = [];
      for (let t = 0; t <= 3000; t += 50) if (sounds.next(cut, coverage, t) === "tick") at.push(t);
      sounds.reset();
      return at;
    };
    expect(ticks(0.1).length).toBeLessThan(ticks(0.45).length);
    expect(ticks(0.1)[1]! - ticks(0.1)[0]!).toBeGreaterThanOrEqual(tickIntervalMs(0.1));
  });

  it("is quiet when there is no page with writing in view", () => {
    const sounds = new FramingSounds();
    for (const kind of ["dark", "noPage", "noText", "samePage"] as const) {
      for (let t = 0; t < 3000; t += 100) expect(sounds.next({ kind }, 0.3, t)).toBeNull();
    }
  });

  it("chimes once when the whole page is in view, then stops ticking until the page leaves the frame", () => {
    const sounds = new FramingSounds();
    expect(sounds.next({ kind: "tooSmall" }, 0.1, 0)).toBe("tick");
    expect(sounds.next({ kind: "settling" }, 0.4, 2000)).toBe("chime");
    expect(sounds.next({ kind: "settling" }, 0.4, 2100)).toBeNull();
    expect(sounds.next({ kind: "moving" }, 0.4, 4000)).toBeNull();
    expect(sounds.next({ kind: "blurry" }, 0.4, 6000)).toBeNull();
    expect(sounds.next({ kind: "ready", lenient: false }, 0.4, 7000)).toBeNull();
    // The page slid out of view: it ticks again, and chimes again when it is back.
    expect(sounds.next({ kind: "cutOff", edges: { left: false, right: true, top: false, bottom: false } }, 0.3, 8000)).toBe("tick");
    expect(sounds.next({ kind: "settling" }, 0.4, 9000)).toBe("chime");
  });

  it("has no chime for a picture taken without the whole page in view", () => {
    const sounds = new FramingSounds();
    expect(sounds.next({ kind: "ready", lenient: true }, 0.3, 0)).toBeNull();
    expect(sounds.next({ kind: "ready", lenient: false }, 0.3, 100)).toBe("chime");
  });
});
