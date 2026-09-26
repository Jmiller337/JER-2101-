import type { Point, Quad } from "./analysis";

/** The box the camera screen draws around the page it sees. */
export interface PageOutline {
  /** The page's corners as fractions of the picture's width and height, or null for no page. */
  quad: Quad | null;
  /** Green: the picture is being taken (or, with automatic capture off, is ready to take). */
  ready: boolean;
}

export const NO_OUTLINE: PageOutline = { quad: null, ready: false };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a picture appears inside a box when it is shown whole (CSS object-fit: contain). */
export function containRect(pictureWidth: number, pictureHeight: number, boxWidth: number, boxHeight: number): Rect | null {
  if (!pictureWidth || !pictureHeight || !boxWidth || !boxHeight) return null;
  const scale = Math.min(boxWidth / pictureWidth, boxHeight / pictureHeight);
  const width = pictureWidth * scale;
  const height = pictureHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}

/**
 * Where a picture appears inside a box when it fills the box and the overflow is cropped (CSS
 * object-fit: cover). The rectangle can start outside the box.
 */
export function coverRect(pictureWidth: number, pictureHeight: number, boxWidth: number, boxHeight: number): Rect | null {
  if (!pictureWidth || !pictureHeight || !boxWidth || !boxHeight) return null;
  const scale = Math.max(boxWidth / pictureWidth, boxHeight / pictureHeight);
  const width = pictureWidth * scale;
  const height = pictureHeight * scale;
  return { x: (boxWidth - width) / 2, y: (boxHeight - height) / 2, width, height };
}

function mapQuad(quad: Quad, map: (p: Point) => Point): Quad {
  return [map(quad[0]), map(quad[1]), map(quad[2]), map(quad[3])];
}

/** Corners in frame pixels to fractions of the frame. */
export function normalizeQuad(quad: Quad, width: number, height: number): Quad {
  return mapQuad(quad, (p) => ({ x: p.x / width, y: p.y / height }));
}

/** Corners as fractions of the picture to pixels on screen. */
export function placeQuad(quad: Quad, rect: Rect): Quad {
  return mapQuad(quad, (p) => ({ x: rect.x + p.x * rect.width, y: rect.y + p.y * rect.height }));
}

/**
 * The same outline starting from the corner nearest the current outline's first corner. The
 * detector may name a tilted page's corners from a different starting point from one frame to
 * the next; without this the box would spin while it glides.
 */
export function alignQuad(current: Quad, target: Quad): Quad {
  let best = target;
  let bestDistance = Infinity;
  for (let shift = 0; shift < 4; shift++) {
    const turned = [0, 1, 2, 3].map((k) => target[(k + shift) % 4]!) as Quad;
    let distance = 0;
    for (let k = 0; k < 4; k++) distance += Math.hypot(turned[k]!.x - current[k]!.x, turned[k]!.y - current[k]!.y);
    if (distance < bestDistance) {
      best = turned;
      bestDistance = distance;
    }
  }
  return best;
}

/** Moves each corner part of the way to its target, so the box glides instead of jumping. */
export function approachQuad(current: Quad, target: Quad, amount: number): Quad {
  const aligned = alignQuad(current, target);
  return [0, 1, 2, 3].map((k) => ({
    x: current[k]!.x + (aligned[k]!.x - current[k]!.x) * amount,
    y: current[k]!.y + (aligned[k]!.y - current[k]!.y) * amount,
  })) as Quad;
}

/** An SVG polygon's points attribute. */
export function quadPoints(quad: Quad): string {
  return quad.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}
