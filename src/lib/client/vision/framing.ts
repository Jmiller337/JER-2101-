import {
  analyzeFrame,
  boxShift,
  centerBox,
  countEdges,
  frameDifference,
  laplacianVariance,
  toLuma,
  type Box,
  type Edges,
  type FrameAnalysis,
  type Luma,
  type PixelFrame,
} from "./analysis";

export type Situation =
  | { kind: "dark" }
  | { kind: "noPage" }
  /** Something page-like is in view but shows no writing: a blank sheet, a wall, a window. */
  | { kind: "noText" }
  /** The page is ready, but nothing has changed since the last picture: it was just read. */
  | { kind: "samePage" }
  | { kind: "tooBig" }
  | { kind: "tooSmall" }
  | { kind: "cutOff"; edges: Edges }
  | { kind: "glare" }
  /** The whole page is visible but the phone is moving. */
  | { kind: "moving" }
  /** The whole page is visible and steady, but not for long enough yet. Silent. */
  | { kind: "settling" }
  | { kind: "blurry" }
  /**
   * Take the picture. `lenient` means the framing checks were not all satisfied but the phone
   * has been held calmly over a page for long enough: the reading model judges the photo.
   */
  | { kind: "ready"; lenient: boolean };

/** Tunable thresholds (on a frame about 160 pixels wide). Tune on real phones; see PROGRESS.md. */
export const FRAMING = {
  /** Page brightness (0 to 255) below which the scene is too dark. */
  darkPageMean: 70,
  /** Frame brightness below which the scene is too dark when no page is found. */
  darkFrameMean: 55,
  /** Fraction of page pixels that may be blown-out highlights before it counts as glare. */
  glare: 0.03,
  /** Mean absolute frame difference above which the phone is moving. */
  motion: 5,
  /** How long the page must stay steady before automatic capture. */
  steadyMs: 700,
  /**
   * A hand is never perfectly still, so frame differences alone never settle. The phone counts
   * as calm while the detected page stays within `calmShift` pixels of where it was; a tremor
   * moves it a pixel or two, sliding or shaking moves it more. After `calmMs` of calm with a
   * page in view the picture is taken even if the framing checks (edges, size, glare,
   * sharpness) are not satisfied: the reading model then judges the photo, which is far more
   * reliable than these heuristics on a real phone.
   */
  calmShift: 3,
  calmMs: 2000,
  /** The calm capture still needs this much light on the page (dim photos are brightened). */
  calmDarkPageMean: 55,
  /** ...and a page covering at least this fraction of the frame. */
  calmMinCoverage: 0.05,
  /**
   * Automatic capture needs writing on the page, so it never photographs a table, a wall, a
   * window, or a blank sheet (see `writing` in analysis.ts): some ink (not a blank sheet), not
   * mostly ink (not a keyboard or a dark pattern), some smooth paper (not a carpet or stone),
   * and paper that is not too dark. Pressing Capture always works regardless.
   */
  inkMin: 0.015,
  inkMax: 0.5,
  smoothMin: 0.12,
  paperMin: 60,
  /** After a picture, the view must change by this much before another automatic one. */
  changeDiff: 12,
  /** Below this fraction of the frame the page is too far away. A fully visible letter-sized
   * page covers about 40 to 55 percent of a portrait frame, so this is deliberately low. */
  tooSmallCoverage: 0.2,
  /** Sharpness must reach this fraction of the best seen this session. */
  sharpRelative: 0.6,
  sharpFloor: 15,
  /** Frames seen before the sharpness baseline is trusted. */
  calibrationFrames: 8,
  /** A still is blurry when its center sharpness is below this fraction of the preview's best. */
  stillSharpRelative: 0.35,
} as const;

/** A page with writing on it: some ink, not mostly ink, some smooth paper, and light enough. */
export function isDocument(analysis: FrameAnalysis): boolean {
  return (
    analysis.page.found &&
    analysis.ink >= FRAMING.inkMin &&
    analysis.ink <= FRAMING.inkMax &&
    analysis.smooth >= FRAMING.smoothMin &&
    analysis.paper >= FRAMING.paperMin
  );
}

/**
 * Tracks frames over time: steadiness (how long the picture has not moved) and a sharpness
 * baseline calibrated to this phone and this session, because absolute sharpness values vary
 * between cameras.
 */
export class FramingTracker {
  private previous: Luma | null = null;
  private steadySince: number | null = null;
  /** Where the page was when the current calm period began. */
  private calmRef: { box: Box; since: number } | null = null;
  private sharpMax = 0;
  private centerMax = 0;
  private frames = 0;
  lastAnalysis: FrameAnalysis | null = null;
  /** How long the phone must be calm over a page before a lenient capture; Infinity turns it off. */
  calmMs: number = FRAMING.calmMs;
  /** The view at the last picture: no automatic capture until the view has changed from it. */
  private changeRef: Luma | null = null;
  /** Whether the last frame showed a page with writing on it. */
  lastIsDocument = false;

  /** Holds automatic capture until the view differs from this frame (the page just read). */
  requireChangeFrom(luma: Luma | null): void {
    this.changeRef = luma;
  }

  update(frame: PixelFrame, now: number): Situation {
    const analysis = analyzeFrame(frame, this.previous);
    const hadPrevious = this.previous !== null;
    this.previous = analysis.luma;
    this.lastAnalysis = analysis;
    this.frames += 1;
    this.sharpMax = Math.max(analysis.sharpness, this.sharpMax * 0.995);
    this.centerMax = Math.max(analysis.centerSharpness, this.centerMax * 0.995);

    const moving = !hadPrevious || analysis.motion > FRAMING.motion;
    if (moving) this.steadySince = null;
    else this.steadySince ??= now;

    const page = analysis.page;
    const document = page.found && isDocument(analysis);
    this.lastIsDocument = document;
    // Only a page with writing counts as calm: a steady view of anything else never fires.
    if (page.box && document) {
      if (!this.calmRef || boxShift(this.calmRef.box, page.box) > FRAMING.calmShift) this.calmRef = { box: page.box, since: now };
    } else {
      this.calmRef = null;
    }
    // Until the view changes, the page just read is not taken again.
    if (this.changeRef && frameDifference(analysis.luma, this.changeRef) > FRAMING.changeDiff) this.changeRef = null;
    const ready = (lenient: boolean): Situation => (this.changeRef ? { kind: "samePage" } : { kind: "ready", lenient });
    const calibrated = this.frames >= FRAMING.calibrationFrames;
    const calm = this.calmRef !== null && now - this.calmRef.since >= this.calmMs;
    if (
      document &&
      calm &&
      calibrated &&
      analysis.pageMean >= FRAMING.calmDarkPageMean &&
      page.coverage >= FRAMING.calmMinCoverage
    ) {
      return ready(true);
    }

    const dark = page.found ? analysis.pageMean < FRAMING.darkPageMean : analysis.frameMean < FRAMING.darkFrameMean;
    if (dark) return { kind: "dark" };
    if (!page.found) return { kind: "noPage" };
    if (page.coverage < FRAMING.tooSmallCoverage) return { kind: "tooSmall" };
    if (!document) return { kind: "noText" };
    const t = page.touches;
    const touching = countEdges(t);
    if (touching >= 3 || (t.left && t.right) || (t.top && t.bottom)) return { kind: "tooBig" };
    if (touching > 0) return { kind: "cutOff", edges: t };
    if (analysis.glare > FRAMING.glare) return { kind: "glare" };
    if (moving) return { kind: "moving" };
    if (this.steadySince === null || now - this.steadySince < FRAMING.steadyMs) return { kind: "settling" };
    if (!calibrated) return { kind: "settling" };
    const sharp = analysis.sharpness >= FRAMING.sharpFloor && analysis.sharpness >= this.sharpMax * FRAMING.sharpRelative;
    return sharp ? ready(false) : { kind: "blurry" };
  }

  /** After a capture that did not work out: require a fresh steady period before firing again. */
  resetSteady(): void {
    this.steadySince = null;
    this.calmRef = null;
  }

  /**
   * Checks a captured still (sampled to the same small size) against the preview's sharpness
   * baseline. Lenient on purpose: it only catches gross motion blur at the moment of capture.
   */
  isStillSharp(still: PixelFrame): boolean {
    if (this.frames < FRAMING.calibrationFrames || this.centerMax <= 0) return true;
    const luma = toLuma(still);
    const sharpness = laplacianVariance(luma, centerBox(luma.width, luma.height));
    return sharpness >= this.centerMax * FRAMING.stillSharpRelative;
  }
}

/**
 * Spoken cue for a situation. Directions are for the phone held flat over a page on a table,
 * top edge pointing away from the user: "away from you" means toward the top of the phone.
 */
export function cueFor(situation: Situation, autoCapture: boolean): string | null {
  switch (situation.kind) {
    case "dark":
      return "Too dark. Turn on a light.";
    case "noPage":
      return "I can't see a page.";
    case "noText":
      return "I can't see any writing.";
    case "samePage":
      return "This is the page you just read.";
    case "tooBig":
      return "Lift the phone higher.";
    case "tooSmall":
      return "Move closer to the page.";
    case "cutOff":
      return directionCue(situation.edges);
    case "glare":
      return "Glare. Tilt the phone a little.";
    case "moving":
      return "I see the whole page. Hold still.";
    case "blurry":
      return "Blurry. Hold still.";
    case "settling":
      return null;
    case "ready":
      if (autoCapture) return null;
      return situation.lenient ? "Ready. Press Capture." : "I see the whole page. Press Capture.";
  }
}

/** The page is cut off on these edges, so the phone should move toward them. */
export function directionCue(edges: Edges): string {
  const horizontal = edges.left ? "left" : edges.right ? "right" : null;
  const vertical = edges.top ? "away from you" : edges.bottom ? "toward you" : null;
  if (horizontal && vertical) return `Move ${horizontal} and ${vertical}.`;
  return `Move ${horizontal ?? vertical}.`;
}

function situationKey(situation: Situation): string {
  if (situation.kind !== "cutOff") return situation.kind;
  const e = situation.edges;
  return `cutOff:${e.left ? "l" : ""}${e.right ? "r" : ""}${e.top ? "t" : ""}${e.bottom ? "b" : ""}`;
}

export interface CueMode {
  guidance: "full" | "minimal";
  autoCapture: boolean;
}

/**
 * When to speak a cue (PROMPT.md 6.2): the same situation must hold for a few frames, at most
 * one cue every 1.5 seconds, never the same cue twice within 4 seconds, and "Hold still" may
 * skip the spacing. Minimal guidance speaks only the hold-still cues.
 */
export class CuePolicy {
  private lastKey: string | null = null;
  private streak = 0;
  private lastSpokenAt = -Infinity;
  private lastSpokenText: string | null = null;

  constructor(
    private readonly opts = { hysteresisFrames: 2, minIntervalMs: 1500, repeatMs: 4000 },
  ) {}

  /** The cue to speak now, or null. Call `spoken()` only if it was actually spoken. */
  next(situation: Situation, now: number, mode: CueMode): string | null {
    const key = situationKey(situation);
    if (key === this.lastKey) this.streak += 1;
    else {
      this.lastKey = key;
      this.streak = 1;
    }
    const text = cueFor(situation, mode.autoCapture);
    if (!text) return null;
    const holdStill = situation.kind === "moving" || situation.kind === "blurry";
    if (mode.guidance === "minimal" && !holdStill) return null;
    if (this.streak < this.opts.hysteresisFrames) return null;
    if (!holdStill && now - this.lastSpokenAt < this.opts.minIntervalMs) return null;
    if (text === this.lastSpokenText && now - this.lastSpokenAt < this.opts.repeatMs) return null;
    return text;
  }

  spoken(text: string, now: number): void {
    this.lastSpokenAt = now;
    this.lastSpokenText = text;
  }

  reset(): void {
    this.lastKey = null;
    this.streak = 0;
    this.lastSpokenAt = -Infinity;
    this.lastSpokenText = null;
  }
}
