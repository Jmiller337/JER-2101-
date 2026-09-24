import type { PixelFrame } from "@/lib/client/vision/analysis";

export interface FrameSpec {
  width?: number;
  height?: number;
  /** Page rectangle as fractions of the frame (may extend beyond 0..1). Null for no page. */
  page?: { x0: number; y0: number; x1: number; y1: number } | null;
  background?: number;
  paper?: number;
  ink?: number;
  /** Brightness multiplier for the whole scene. */
  light?: number;
  noise?: number;
  /** A blown-out highlight on the page: centre and radius as fractions of the frame width. */
  glare?: { x: number; y: number; r: number };
  /** Shift the whole page by this many pixels (hand movement). */
  shift?: number;
  seed?: number;
}

/** Draws a synthetic camera frame: a textured table, a page with lines of "text", noise. */
export function makeFrame(spec: FrameSpec = {}): PixelFrame {
  const width = spec.width ?? 160;
  const height = spec.height ?? 120;
  const page = spec.page === undefined ? { x0: 0.2, y0: 0.1, x1: 0.8, y1: 0.9 } : spec.page;
  const background = spec.background ?? 80;
  const paper = spec.paper ?? 225;
  const ink = spec.ink ?? 40;
  const light = spec.light ?? 1;
  const noise = spec.noise ?? 4;
  const shift = spec.shift ?? 0;
  let seed = spec.seed ?? 1;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = background + 10 * Math.sin(x / 5 + Math.sin(y / 11) * 2);
      if (page) {
        const px0 = page.x0 * width + shift;
        const px1 = page.x1 * width + shift;
        const py0 = page.y0 * height;
        const py1 = page.y1 * height;
        if (x >= px0 && x < px1 && y >= py0 && y < py1) {
          v = paper;
          const u = (x - px0) / (px1 - px0);
          const w = (y - py0) / (py1 - py0);
          if (u > 0.12 && u < 0.88 && w > 0.1 && w < 0.9) {
            const line = (w - 0.1) / 0.07;
            if (line - Math.floor(line) < 0.4 && (u * 30 + Math.floor(line)) % 6 < 4.8) v = ink;
          }
          if (spec.glare) {
            const dx = x - spec.glare.x * width;
            const dy = y - spec.glare.y * width;
            if (dx * dx + dy * dy < (spec.glare.r * width) ** 2) v = 255;
          }
        }
      }
      v = v * light + (rand() - 0.5) * noise;
      const i = (y * width + x) * 4;
      const c = Math.max(0, Math.min(255, Math.round(v)));
      data[i] = c;
      data[i + 1] = c;
      data[i + 2] = c;
      data[i + 3] = 255;
    }
  }
  return { data, width, height };
}

/** Box blur, to simulate motion or focus blur. */
export function blurFrame(frame: PixelFrame, radius: number): PixelFrame {
  const { width, height, data } = frame;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = Math.min(width - 1, Math.max(0, x + dx));
          const yy = Math.min(height - 1, Math.max(0, y + dy));
          sum += data[(yy * width + xx) * 4]!;
          n += 1;
        }
      }
      const i = (y * width + x) * 4;
      const v = Math.round(sum / n);
      out[i] = v;
      out[i + 1] = v;
      out[i + 2] = v;
      out[i + 3] = 255;
    }
  }
  return { data: out, width, height };
}
