/**
 * Brightens and stretches a dim or faded photo before it is sent (a page in a dark room, a
 * thermal receipt that has faded to grey). A plain linear stretch of the brightness range: no
 * thresholding or sharpening, which would destroy detail the reading model can use. Photos that
 * already use the full range are left untouched.
 */

export interface Levels {
  /** Brightness mapped to black. */
  lo: number;
  /** Multiplier applied after subtracting `lo`. */
  gain: number;
}

/** The stretch never multiplies by more than this, so noise in a very dark photo is not blown up. */
export const MAX_GAIN = 2.5;

function percentile(hist: ArrayLike<number>, total: number, fraction: number): number {
  let acc = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v]!;
    if (acc >= total * fraction) return v;
  }
  return 255;
}

/** The stretch for a brightness histogram, or null when the photo needs no help. */
export function levelsFor(hist: ArrayLike<number>, total: number): Levels | null {
  if (total <= 0) return null;
  const lo = percentile(hist, total, 0.01);
  const hi = percentile(hist, total, 0.99);
  // Bright paper and a wide range: a well exposed photo.
  if (hi >= 215 && hi - lo >= 150) return null;
  const gain = Math.min(MAX_GAIN, 250 / Math.max(hi - lo, 40));
  if (gain < 1.1) return null;
  return { lo, gain };
}

/** Brightness histogram of RGBA pixels, sampling every `step`-th pixel. */
export function brightnessHistogram(data: ArrayLike<number>, step = 4): { hist: Uint32Array; total: number } {
  const hist = new Uint32Array(256);
  let total = 0;
  for (let i = 0; i + 2 < data.length; i += 4 * step) {
    hist[(data[i]! * 77 + data[i + 1]! * 150 + data[i + 2]! * 29) >> 8]! += 1;
    total += 1;
  }
  return { hist, total };
}

/** Applies the stretch to RGBA pixels in place (alpha untouched). */
export function applyLevels(data: Uint8ClampedArray, { lo, gain }: Levels): void {
  const table = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) table[v] = Math.round((v - lo) * gain);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = table[data[i]!]!;
    data[i + 1] = table[data[i + 1]!]!;
    data[i + 2] = table[data[i + 2]!]!;
  }
}

/** Stretches the pixels in place when the photo is dim or faded. Returns whether it did. */
export function enhanceForReading(data: Uint8ClampedArray): boolean {
  const { hist, total } = brightnessHistogram(data);
  const levels = levelsFor(hist, total);
  if (!levels) return false;
  applyLevels(data, levels);
  return true;
}
