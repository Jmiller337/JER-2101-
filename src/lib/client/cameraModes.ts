/**
 * The camera screen's modes, in order from left to right, like the iPhone Camera's Photo,
 * Video, and Slo-mo: swipe or tap to move between them, and each one says its name.
 */
export type CameraMode = "pdf" | "camera" | "photos";

export const CAMERA_MODES: readonly CameraMode[] = ["pdf", "camera", "photos"];

export const CAMERA_MODE_NAMES: Record<CameraMode, string> = {
  pdf: "PDF",
  camera: "Camera",
  photos: "Photos",
};

/** What the app says on arriving at each mode. */
export const CAMERA_MODE_LINES: Record<CameraMode, string> = {
  pdf: "PDF. Tap the bottom of the screen to choose a file.",
  camera: "Camera.",
  photos: "Photos. Tap the bottom of the screen to choose a photo.",
};

/** Said with "Camera ready." until the user has changed mode once. */
export const MODES_HINT = "Swipe left or right for PDF and Photos.";

export type SwipeDirection = "left" | "right";

/**
 * The mode a swipe lands on, or null at either end. As on the iPhone, swiping left brings in
 * the mode on the right.
 */
export function modeAfterSwipe(current: CameraMode, direction: SwipeDirection): CameraMode | null {
  const index = CAMERA_MODES.indexOf(current) + (direction === "left" ? 1 : -1);
  return CAMERA_MODES[index] ?? null;
}

export const SWIPE = {
  /** The finger must travel at least this far sideways (CSS pixels)... */
  minDistance: 50,
  /** ...clearly more sideways than up or down... */
  minRatio: 1.5,
  /** ...and within this time, so a slow drag or a long press is not a swipe. */
  maxMs: 800,
} as const;

/** Turns a pointer going down and coming up into a left or right swipe, or nothing. */
export class SwipeTracker {
  private start: { x: number; y: number; t: number; id: number } | null = null;

  down(x: number, y: number, t: number, id: number): void {
    this.start = { x, y, t, id };
  }

  up(x: number, y: number, t: number, id: number): SwipeDirection | null {
    const start = this.start;
    this.start = null;
    if (!start || start.id !== id || t - start.t > SWIPE.maxMs) return null;
    const dx = x - start.x;
    const dy = y - start.y;
    if (Math.abs(dx) < SWIPE.minDistance || Math.abs(dx) < Math.abs(dy) * SWIPE.minRatio) return null;
    return dx < 0 ? "left" : "right";
  }

  cancel(): void {
    this.start = null;
  }
}
