/**
 * Writes Y4M videos for Chromium's fake camera (--use-file-for-fake-video-capture). Frames are
 * drawn directly in YUV: a textured table, a white page with dark "text lines", and optional
 * motion, following a timeline. Pure Node, no dependencies, so the e2e setup can generate the
 * videos on any machine instead of committing tens of megabytes of video.
 */
import { mkdirSync, openSync, writeSync, closeSync } from "node:fs";
import path from "node:path";

export interface PageRect {
  /** Page centre as a fraction of the frame width and height. */
  cx: number;
  cy: number;
  /** Page size as a fraction of the frame width and height. */
  w: number;
  h: number;
}

export interface Keyframe {
  /** Seconds from the start of the video. */
  at: number;
  page: PageRect | null;
  /** Random jitter in pixels applied each frame (hand shake). */
  jitter?: number;
}

export interface VideoSpec {
  width: number;
  height: number;
  fps: number;
  seconds: number;
  keyframes: Keyframe[];
  /** Overall brightness multiplier (0.2 for a dark room). */
  light?: number;
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function frameAt(spec: VideoSpec, t: number, rand: () => number): { page: PageRect | null; jitter: number } {
  let current = spec.keyframes[0]!;
  for (const key of spec.keyframes) if (key.at <= t) current = key;
  const next = spec.keyframes.find((key) => key.at > t);
  let page = current.page;
  if (page && next?.page && next.at > current.at) {
    const f = (t - current.at) / (next.at - current.at);
    page = {
      cx: page.cx + (next.page.cx - page.cx) * f,
      cy: page.cy + (next.page.cy - page.cy) * f,
      w: page.w + (next.page.w - page.w) * f,
      h: page.h + (next.page.h - page.h) * f,
    };
  }
  const jitter = (current.jitter ?? 0) * (rand() * 2 - 1);
  return { page, jitter };
}

export function writeY4m(file: string, spec: VideoSpec): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const { width: W, height: H, fps } = spec;
  const light = spec.light ?? 1;
  const fd = openSync(file, "w");
  writeSync(fd, Buffer.from(`YUV4MPEG2 W${W} H${H} F${fps}:1 Ip A1:1 C420jpeg\n`, "ascii"));
  const rand = seededRandom(42);
  const y = Buffer.alloc(W * H);
  const uv = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const frames = Math.round(spec.seconds * fps);
  for (let n = 0; n < frames; n++) {
    const { page, jitter } = frameAt(spec, n / fps, rand);
    const jx = Math.round(jitter);
    const jy = Math.round(jitter * 0.7);
    let x0 = 0;
    let x1 = -1;
    let y0 = 0;
    let y1 = -1;
    if (page) {
      x0 = Math.round((page.cx - page.w / 2) * W) + jx;
      x1 = Math.round((page.cx + page.w / 2) * W) + jx;
      y0 = Math.round((page.cy - page.h / 2) * H) + jy;
      y1 = Math.round((page.cy + page.h / 2) * H) + jy;
    }
    const pageW = x1 - x0;
    const pageH = y1 - y0;
    for (let row = 0; row < H; row++) {
      for (let col = 0; col < W; col++) {
        let v: number;
        const inPage = page && col >= x0 && col < x1 && row >= y0 && row < y1;
        if (inPage) {
          v = 232;
          // Text lines: rows of dark bars inside 10% margins, every ~6% of the page height.
          const px = (col - x0) / pageW;
          const py = (row - y0) / pageH;
          if (px > 0.1 && px < 0.9 && py > 0.1 && py < 0.9) {
            const line = (py - 0.1) / 0.06;
            const inLine = line - Math.floor(line) < 0.35;
            const lineIndex = Math.floor(line);
            const lineEnd = 0.9 - ((lineIndex * 37) % 30) / 100; // ragged right edge
            // Words: gaps every so often along the line.
            const word = (px * 40 + lineIndex * 3) % 7 < 5.6;
            if (inLine && px < lineEnd && word) v = 45;
          }
        } else {
          // Wood-like table: stripes plus grain.
          v = 88 + 14 * Math.sin(col / 9 + Math.sin(row / 23) * 2) + 6 * Math.sin(row / 3.1);
        }
        v = v * light + (rand() - 0.5) * 6;
        y[row * W + col] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
    writeSync(fd, Buffer.from("FRAME\n", "ascii"));
    writeSync(fd, y);
    writeSync(fd, uv);
  }
  closeSync(fd);
}

const CENTERED: PageRect = { cx: 0.5, cy: 0.5, w: 0.62, h: 0.8 };

/** Videos used by the end-to-end tests. */
export const VIDEOS: Record<string, VideoSpec> = {
  // A page held steady in the middle of the frame.
  "static-page": { width: 480, height: 360, fps: 10, seconds: 4, keyframes: [{ at: 0, page: CENTERED }] },
  // Nothing, then a page cut off on the right sliding in, then shaking, then steady.
  "page-into-frame": {
    width: 480,
    height: 360,
    fps: 10,
    seconds: 12,
    keyframes: [
      { at: 0, page: null },
      { at: 2, page: { cx: 0.95, cy: 0.5, w: 0.62, h: 0.8 } },
      { at: 4.5, page: { cx: 0.8, cy: 0.5, w: 0.62, h: 0.8 } },
      { at: 4.6, page: CENTERED, jitter: 14 },
      { at: 6.5, page: CENTERED, jitter: 0 },
    ],
  },
  // A dark room.
  "dark-room": { width: 480, height: 360, fps: 10, seconds: 3, keyframes: [{ at: 0, page: CENTERED }], light: 0.2 },
  // A page held too close, overflowing the frame on every side, with a slight hand tremor.
  "page-too-close": {
    width: 480,
    height: 360,
    fps: 10,
    seconds: 8,
    keyframes: [{ at: 0, page: { cx: 0.5, cy: 0.5, w: 1.15, h: 1.15 }, jitter: 3 }],
  },
};

export function generateAll(dir: string, force = false): string[] {
  const written: string[] = [];
  for (const [name, spec] of Object.entries(VIDEOS)) {
    const file = path.join(dir, `${name}.y4m`);
    if (!force) {
      try {
        // Skip existing files.
        closeSync(openSync(file, "r"));
        continue;
      } catch {
        // missing: write it
      }
    }
    writeY4m(file, spec);
    written.push(file);
  }
  return written;
}
