import { describe, expect, it } from "vitest";
import { analyzeFrame, findPage, frameDifference, laplacianVariance, toLuma, type Quad } from "@/lib/client/vision/analysis";
import { CuePolicy, cueFor, directionCue, FramingTracker, type Situation } from "@/lib/client/vision/framing";
import { alignQuad, approachQuad, containRect, normalizeQuad, placeQuad } from "@/lib/client/vision/outline";
import { blurFrame, makeFrame } from "../helpers/frames";

const CENTERED = { x0: 0.2, y0: 0.1, x1: 0.8, y1: 0.9 };


describe("findPage", () => {
  it("finds a centred page that touches no edge", () => {
    const page = findPage(toLuma(makeFrame({ page: CENTERED })));
    expect(page.found).toBe(true);
    expect(page.strategy).toBe("bright");
    expect(page.touches).toEqual({ left: false, right: false, top: false, bottom: false });
    expect(page.coverage).toBeGreaterThan(0.4);
    expect(page.coverage).toBeLessThan(0.6);
  });

  it("reports the edge a page is cut off on", () => {
    const right = findPage(toLuma(makeFrame({ page: { x0: 0.5, y0: 0.1, x1: 1.3, y1: 0.9 } })));
    expect(right.touches).toEqual({ left: false, right: true, top: false, bottom: false });
    const topLeft = findPage(toLuma(makeFrame({ page: { x0: -0.2, y0: -0.2, x1: 0.6, y1: 0.7 } })));
    expect(topLeft.touches).toMatchObject({ left: true, top: true, right: false, bottom: false });
  });

  it("finds nothing on an empty table", () => {
    expect(findPage(toLuma(makeFrame({ page: null }))).found).toBe(false);
  });

  it("finds a white page on a white table by its text", () => {
    const page = findPage(toLuma(makeFrame({ page: CENTERED, background: 222 })));
    expect(page.found).toBe(true);
    expect(page.strategy).toBe("edges");
    expect(page.touches).toEqual({ left: false, right: false, top: false, bottom: false });
  });

  it("treats a page filling the frame as too close", () => {
    const page = findPage(toLuma(makeFrame({ page: { x0: -0.1, y0: -0.1, x1: 1.1, y1: 1.1 } })));
    expect(page.found).toBe(true);
    expect(page.touches.left && page.touches.right).toBe(true);
  });
});

/** The corners of a page rectangle (fractions of a 160 by 120 frame) turned about its centre. */
function turnedCorners(page: { x0: number; y0: number; x1: number; y1: number }, degrees: number) {
  const [x0, x1, y0, y1] = [page.x0 * 160, page.x1 * 160, page.y0 * 120, page.y1 * 120];
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const t = (degrees * Math.PI) / 180;
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ].map(([x, y]) => ({
    x: cx + (x! - cx) * Math.cos(t) - (y! - cy) * Math.sin(t),
    y: cy + (x! - cx) * Math.sin(t) + (y! - cy) * Math.cos(t),
  }));
}

/** The largest distance from each true corner to the nearest found corner. */
function cornerError(found: Quad | null, truth: Array<{ x: number; y: number }>): number {
  if (!found) return Infinity;
  return Math.max(...truth.map((t) => Math.min(...found.map((f) => Math.hypot(f.x - t.x, f.y - t.y)))));
}

describe("page corners", () => {
  const page = { x0: 0.25, y0: 0.15, x1: 0.75, y1: 0.85 };

  it("finds the corners of an upright page exactly", () => {
    const found = findPage(toLuma(makeFrame({ page })));
    expect(found.quad).toEqual([
      { x: 40, y: 18 },
      { x: 120, y: 18 },
      { x: 120, y: 102 },
      { x: 40, y: 102 },
    ]);
  });

  it("follows a tilted page's corners at any angle", () => {
    for (const angle of [8, -15, 20, 35, 44, 60]) {
      const found = findPage(toLuma(makeFrame({ page, angle })));
      expect(found.strategy, `at ${angle} degrees`).toBe("bright");
      // Within 4 pixels of 160 (2.5% of the picture): the pixel grid rounds a turned corner inward.
      expect(cornerError(found.quad, turnedCorners(page, angle)), `at ${angle} degrees`).toBeLessThan(4);
    }
  });

  it("outlines a white page on a white table by the box around its text", () => {
    const found = findPage(toLuma(makeFrame({ page, background: 222 })));
    expect(found.strategy).toBe("edges");
    const box = found.box!;
    expect(found.quad).toEqual([
      { x: box.x0, y: box.y0 },
      { x: box.x1 + 1, y: box.y0 },
      { x: box.x1 + 1, y: box.y1 + 1 },
      { x: box.x0, y: box.y1 + 1 },
    ]);
  });
});

describe("drawing the box", () => {
  const square: Quad = [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.75, y: 0.75 },
    { x: 0.25, y: 0.75 },
  ];

  it("places the page where the whole picture is shown", () => {
    // A landscape picture in a portrait box: bars above and below.
    expect(containRect(480, 360, 390, 600)).toEqual({ x: 0, y: 153.75, width: 390, height: 292.5 });
    // A portrait picture in a wider box: bars at the sides.
    expect(containRect(1080, 1920, 390, 600)).toEqual({ x: 26.25, y: 0, width: 337.5, height: 600 });
    expect(containRect(0, 0, 390, 600)).toBeNull();
    const placed = placeQuad(normalizeQuad([{ x: 40, y: 30 }, { x: 120, y: 30 }, { x: 120, y: 90 }, { x: 40, y: 90 }], 160, 120), {
      x: 10,
      y: 20,
      width: 320,
      height: 240,
    });
    expect(placed[0]).toEqual({ x: 90, y: 80 });
    expect(placed[2]).toEqual({ x: 250, y: 200 });
  });

  it("glides toward the new corners without spinning when they are named from another corner", () => {
    const renamed: Quad = [square[2], square[3], square[0], square[1]];
    expect(alignQuad(square, renamed)).toEqual(square);
    const moved = square.map((p) => ({ x: p.x + 0.1, y: p.y })) as Quad;
    const halfway = approachQuad(square, [moved[1], moved[2], moved[3], moved[0]], 0.5);
    halfway.forEach((p, k) => {
      expect(p.x).toBeCloseTo(square[k]!.x + 0.05);
      expect(p.y).toBeCloseTo(square[k]!.y);
    });
  });
});

describe("measures", () => {
  it("blur lowers the Laplacian variance a lot", () => {
    const sharp = toLuma(makeFrame());
    const blurred = toLuma(blurFrame(makeFrame(), 2));
    expect(laplacianVariance(blurred)).toBeLessThan(laplacianVariance(sharp) * 0.3);
  });

  it("frame difference is small for noise and large for movement", () => {
    const a = toLuma(makeFrame({ seed: 1 }));
    const b = toLuma(makeFrame({ seed: 2 }));
    const moved = toLuma(makeFrame({ seed: 2, shift: 4 }));
    expect(frameDifference(a, b)).toBeLessThan(3);
    expect(frameDifference(a, moved)).toBeGreaterThan(6);
  });

  it("detects glare on the page but not on evenly bright paper", () => {
    const glare = analyzeFrame(makeFrame({ glare: { x: 0.5, y: 0.35, r: 0.08 } }), null);
    expect(glare.glare).toBeGreaterThan(0.03);
    const clean = analyzeFrame(makeFrame(), null);
    expect(clean.glare).toBeLessThan(0.01);
  });
});

describe("FramingTracker", () => {
  it("becomes ready after the page has been steady for 700 ms", () => {
    const tracker = new FramingTracker();
    const kinds: string[] = [];
    for (let i = 0; i < 14; i++) kinds.push(tracker.update(makeFrame({ seed: i + 1 }), i * 100).kind);
    expect(kinds[0]).toBe("moving");
    expect(kinds.slice(1, 8).every((k) => k === "settling")).toBe(true);
    expect(kinds.at(-1)).toBe("ready");
  });

  it("says hold still while the phone moves", () => {
    const tracker = new FramingTracker();
    tracker.update(makeFrame({ seed: 1 }), 0);
    expect(tracker.update(makeFrame({ seed: 2, shift: 5 }), 150).kind).toBe("moving");
  });

  it("classifies the common framing problems", () => {
    const one = (spec: Parameters<typeof makeFrame>[0]) => new FramingTracker().update(makeFrame(spec), 0);
    expect(one({ page: null }).kind).toBe("noPage");
    expect(one({ light: 0.25 }).kind).toBe("dark");
    expect(one({ page: { x0: 0.45, y0: 0.4, x1: 0.6, y1: 0.6 } }).kind).toBe("tooSmall");
    expect(one({ page: { x0: -0.1, y0: -0.1, x1: 1.1, y1: 1.1 } }).kind).toBe("tooBig");
    expect(one({ page: { x0: 0.5, y0: 0.1, x1: 1.3, y1: 0.9 } })).toEqual({
      kind: "cutOff",
      edges: { left: false, right: true, top: false, bottom: false },
    });
    expect(one({ glare: { x: 0.5, y: 0.35, r: 0.08 } }).kind).toBe("glare");
  });

  it("reports blur when the page goes soft after calibration", () => {
    const tracker = new FramingTracker();
    // Only the strict checks: the calm capture is covered below.
    tracker.calmMs = Infinity;
    for (let i = 0; i < 10; i++) tracker.update(makeFrame({ seed: i + 1 }), i * 100);
    let last: Situation = { kind: "noPage" };
    for (let i = 10; i < 20; i++) last = tracker.update(blurFrame(makeFrame({ seed: i + 1 }), 2), i * 100);
    expect(last.kind).toBe("blurry");
  });

  it("captures a page that stays cut off once the phone has been calm for a second and a half", () => {
    const tracker = new FramingTracker();
    const cutOff = { x0: 0.5, y0: 0.1, x1: 1.3, y1: 0.9 };
    const kinds: string[] = [];
    for (let i = 0; i < 20; i++) kinds.push(tracker.update(makeFrame({ page: cutOff, seed: i + 1 }), i * 100).kind);
    expect(kinds[10]).toBe("cutOff");
    expect(kinds[14]).toBe("cutOff");
    expect(kinds[15]).toBe("ready");
    expect(tracker.update(makeFrame({ page: cutOff, seed: 41 }), 2000)).toEqual({ kind: "ready", lenient: true });
  });

  it("captures a tilted page, a blurry page, and a dim page once the phone is calm", () => {
    const calmly = (spec: Parameters<typeof makeFrame>[0], blurFrom = Infinity) => {
      const tracker = new FramingTracker();
      const seen: Situation[] = [];
      for (let i = 0; i < 20; i++) {
        const frame = makeFrame({ ...spec, seed: i + 1 });
        seen.push(tracker.update(i >= blurFrom ? blurFrame(frame, 2) : frame, i * 100));
      }
      return seen;
    };
    const strictReady = (seen: Situation[]) => seen.some((s) => s.kind === "ready" && !s.lenient);
    // Tilted and running off the bottom of the picture.
    const tilted = calmly({ page: { x0: 0.25, y0: 0.3, x1: 0.75, y1: 1.1 }, angle: 12 });
    expect(tilted[10]?.kind).toBe("cutOff");
    expect(strictReady(tilted)).toBe(false);
    expect(tilted.at(-1)).toEqual({ kind: "ready", lenient: true });
    // Gone soft after the sharpness baseline was set, so the strict checks never pass.
    const blurry = calmly({}, 8);
    expect(strictReady(blurry)).toBe(false);
    expect(blurry.at(-1)).toEqual({ kind: "ready", lenient: true });
    // Too dim for the strict checks, bright enough to be brightened and read.
    const dim = calmly({ light: 0.34 });
    expect(dim[10]?.kind).toBe("dark");
    expect(strictReady(dim)).toBe(false);
    expect(dim.at(-1)).toEqual({ kind: "ready", lenient: true });
  });

  it("stays calm through a slight hand tremor but not through real movement", () => {
    const cutOff = { x0: 0.5, y0: 0.1, x1: 1.3, y1: 0.9 };
    const tremor = new FramingTracker();
    let last: Situation = { kind: "noPage" };
    for (let i = 0; i < 40; i++) last = tremor.update(makeFrame({ page: cutOff, seed: i + 1, shift: i % 2 }), i * 100);
    expect(last).toEqual({ kind: "ready", lenient: true });
    const shaky = new FramingTracker();
    for (let i = 0; i < 40; i++) last = shaky.update(makeFrame({ page: cutOff, seed: i + 1, shift: (i % 2) * 5 }), i * 100);
    expect(last.kind).toBe("cutOff");
    // A page sliding across the table is not calm either, however slowly it moves.
    const sliding = new FramingTracker();
    for (let i = 0; i < 40; i++) last = sliding.update(makeFrame({ page: cutOff, seed: i + 1, shift: -Math.floor(i / 2) }), i * 100);
    expect(last.kind).toBe("cutOff");
  });

  it("never takes a lenient picture of an empty table, a very dark scene, or after it is turned off", () => {
    const empty = new FramingTracker();
    let last: Situation = { kind: "ready", lenient: false };
    for (let i = 0; i < 40; i++) last = empty.update(makeFrame({ page: null, seed: i + 1 }), i * 100);
    expect(last.kind).toBe("noPage");
    const dark = new FramingTracker();
    for (let i = 0; i < 40; i++) last = dark.update(makeFrame({ light: 0.15, seed: i + 1 }), i * 100);
    expect(last.kind).toBe("dark");
    const off = new FramingTracker();
    off.calmMs = Infinity;
    const cutOff = { x0: 0.5, y0: 0.1, x1: 1.3, y1: 0.9 };
    for (let i = 0; i < 60; i++) last = off.update(makeFrame({ page: cutOff, seed: i + 1 }), i * 100);
    expect(last.kind).toBe("cutOff");
  });

  it("restarts the calm clock after a capture that did not work out", () => {
    const tracker = new FramingTracker();
    const cutOff = { x0: 0.5, y0: 0.1, x1: 1.3, y1: 0.9 };
    let last: Situation = { kind: "noPage" };
    for (let i = 0; i < 35; i++) last = tracker.update(makeFrame({ page: cutOff, seed: i + 1 }), i * 100);
    expect(last.kind).toBe("ready");
    tracker.resetSteady();
    expect(tracker.update(makeFrame({ page: cutOff, seed: 36 }), 3500).kind).toBe("cutOff");
    expect(tracker.update(makeFrame({ page: cutOff, seed: 37 }), 4900).kind).toBe("cutOff");
    expect(tracker.update(makeFrame({ page: cutOff, seed: 38 }), 5000).kind).toBe("ready");
  });

  it("checks a captured still against the preview's sharpness", () => {
    const tracker = new FramingTracker();
    for (let i = 0; i < 10; i++) tracker.update(makeFrame({ seed: i + 1 }), i * 100);
    expect(tracker.isStillSharp(makeFrame({ seed: 99 }))).toBe(true);
    expect(tracker.isStillSharp(blurFrame(makeFrame({ seed: 99 }), 3))).toBe(false);
  });
});

describe("cues", () => {
  it("names directions for a phone held flat over the page", () => {
    expect(directionCue({ left: true, right: false, top: false, bottom: false })).toBe("Move left.");
    expect(directionCue({ left: false, right: false, top: true, bottom: false })).toBe("Move away from you.");
    expect(directionCue({ left: false, right: true, top: false, bottom: true })).toBe("Move right and toward you.");
  });

  it("asks for Capture when automatic capture is off", () => {
    expect(cueFor({ kind: "ready", lenient: false }, true)).toBeNull();
    expect(cueFor({ kind: "ready", lenient: false }, false)).toBe("I see the whole page. Press Capture.");
    expect(cueFor({ kind: "ready", lenient: true }, false)).toBe("Ready. Press Capture.");
    expect(cueFor({ kind: "settling" }, true)).toBeNull();
  });
});

describe("CuePolicy", () => {
  const full = { guidance: "full" as const, autoCapture: true };

  it("waits for the situation to hold for two frames", () => {
    const policy = new CuePolicy();
    expect(policy.next({ kind: "noPage" }, 0, full)).toBeNull();
    expect(policy.next({ kind: "noPage" }, 150, full)).toBe("I can't see a page.");
  });

  it("spaces cues 1.5 seconds apart and suppresses repeats for 4 seconds", () => {
    const policy = new CuePolicy();
    const dark = { kind: "dark" } as const;
    const noPage = { kind: "noPage" } as const;
    policy.next(dark, 0, full);
    const first = policy.next(dark, 100, full)!;
    policy.spoken(first, 100);
    policy.next(noPage, 200, full);
    expect(policy.next(noPage, 300, full)).toBeNull(); // too soon
    expect(policy.next(noPage, 1700, full)).toBe("I can't see a page.");
    policy.next(dark, 1800, full);
    expect(policy.next(dark, 2000, full)).toBeNull(); // same cue within 4 s of the last "Too dark"
    expect(policy.next(dark, 4200, full)).toBe("Too dark. Turn on a light.");
  });

  it("lets hold still skip the spacing", () => {
    const policy = new CuePolicy();
    policy.spoken("Move left.", 0);
    policy.next({ kind: "moving" }, 100, full);
    expect(policy.next({ kind: "moving" }, 200, full)).toBe("I see the whole page. Hold still.");
  });

  it("speaks only hold still in minimal guidance", () => {
    const policy = new CuePolicy();
    const minimal = { guidance: "minimal" as const, autoCapture: true };
    policy.next({ kind: "noPage" }, 0, minimal);
    expect(policy.next({ kind: "noPage" }, 150, minimal)).toBeNull();
    policy.next({ kind: "moving" }, 300, minimal);
    expect(policy.next({ kind: "moving" }, 450, minimal)).toBe("I see the whole page. Hold still.");
  });
});
