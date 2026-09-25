import type { PixelFrame } from "../vision/analysis";

export const ANALYSIS_WIDTH = 160;

/**
 * Draws a video frame (or a captured still) onto a small canvas and reads its pixels for frame
 * analysis. The canvas is reused; `willReadFrequently` keeps reads fast.
 */
export class FrameSampler {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;

  /**
   * The middle half of the picture at `width` pixels wide: enough detail to compare how sharp
   * two frames are, which the small analysis copy cannot show.
   */
  sampleCenter(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width = 480): PixelFrame | null {
    if (!sourceWidth || !sourceHeight) return null;
    const sx = sourceWidth / 4;
    const sy = sourceHeight / 4;
    const sw = sourceWidth / 2;
    const sh = sourceHeight / 2;
    return this.draw(width, Math.max(1, Math.round((width * sh) / sw)), (ctx, w, h) => ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h));
  }

  sample(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, width = ANALYSIS_WIDTH): PixelFrame | null {
    if (!sourceWidth || !sourceHeight) return null;
    const height = Math.max(1, Math.round((width * sourceHeight) / sourceWidth));
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    }
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!ctx) return null;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    try {
      ctx.drawImage(source, 0, 0, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      return { data: image.data, width, height };
    } catch {
      return null;
    }
  }

  private draw(
    width: number,
    height: number,
    paint: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  ): PixelFrame | null {
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });
    }
    const canvas = this.canvas;
    const ctx = this.ctx;
    if (!ctx) return null;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    try {
      paint(ctx, width, height);
      const image = ctx.getImageData(0, 0, width, height);
      return { data: image.data, width, height };
    } catch {
      return null;
    }
  }
}
