import { describe, expect, it } from "vitest";
import { CAMERA_MODES, modeAfterSwipe, SWIPE, SwipeTracker } from "@/lib/client/cameraModes";

describe("camera modes", () => {
  it("are PDF, Camera, and Photos from left to right", () => {
    expect(CAMERA_MODES).toEqual(["pdf", "camera", "photos"]);
  });

  it("swiping left brings in the mode on the right, and stops at the ends", () => {
    expect(modeAfterSwipe("camera", "left")).toBe("photos");
    expect(modeAfterSwipe("camera", "right")).toBe("pdf");
    expect(modeAfterSwipe("photos", "left")).toBeNull();
    expect(modeAfterSwipe("pdf", "right")).toBeNull();
  });
});

describe("SwipeTracker", () => {
  const swipe = (dx: number, dy: number, ms = 200, id = 1, upId = id) => {
    const tracker = new SwipeTracker();
    tracker.down(200, 300, 1000, id);
    return tracker.up(200 + dx, 300 + dy, 1000 + ms, upId);
  };

  it("recognises a quick sideways swipe in either direction", () => {
    expect(swipe(-120, 10)).toBe("left");
    expect(swipe(120, -10)).toBe("right");
    expect(swipe(-SWIPE.minDistance, 0)).toBe("left");
  });

  it("ignores taps, short moves, up-and-down moves, and slow drags", () => {
    expect(swipe(0, 0)).toBeNull();
    expect(swipe(-30, 0)).toBeNull();
    expect(swipe(-80, 70)).toBeNull();
    expect(swipe(10, 200)).toBeNull();
    expect(swipe(-150, 0, SWIPE.maxMs + 1)).toBeNull();
  });

  it("ignores a pointer that did not start the gesture, and a cancelled one", () => {
    expect(swipe(-150, 0, 200, 1, 2)).toBeNull();
    const tracker = new SwipeTracker();
    tracker.down(200, 300, 0, 1);
    tracker.cancel();
    expect(tracker.up(20, 300, 100, 1)).toBeNull();
    expect(new SwipeTracker().up(20, 300, 100, 1)).toBeNull();
  });
});
