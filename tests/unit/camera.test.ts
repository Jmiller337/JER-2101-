import { describe, expect, it } from "vitest";
import { isInAppBrowser } from "@/lib/client/camera/camera";
import { targetSize } from "@/lib/client/camera/prepare";
import { bestOfBurst } from "@/lib/client/camera/camera";
import { applyLevels, brightnessHistogram, enhanceForReading, levelsFor, MAX_GAIN } from "@/lib/client/camera/enhance";

const SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1";
const INSTAGRAM =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0";
const FACEBOOK =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]";
const GENERIC_WEBVIEW =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

describe("isInAppBrowser", () => {
  it("recognizes real browsers", () => {
    expect(isInAppBrowser(SAFARI)).toBe(false);
    expect(isInAppBrowser(CHROME_IOS)).toBe(false);
    expect(isInAppBrowser(ANDROID_CHROME)).toBe(false);
  });
  it("recognizes browsers inside other apps", () => {
    expect(isInAppBrowser(INSTAGRAM)).toBe(true);
    expect(isInAppBrowser(FACEBOOK)).toBe(true);
    expect(isInAppBrowser(GENERIC_WEBVIEW)).toBe(true);
  });
  it("treats a home-screen web app as a real browser", () => {
    expect(isInAppBrowser(GENERIC_WEBVIEW, true)).toBe(false);
  });
});

describe("targetSize", () => {
  it("scales the long edge down to 2576 pixels, the most the reading model uses", () => {
    expect(targetSize(4032, 3024)).toEqual({ width: 2576, height: 1932 });
    expect(targetSize(1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(targetSize(3024, 4032)).toEqual({ width: 1932, height: 2576 });
  });
});

/** RGBA pixels whose brightness is spread evenly between `lo` and `hi` (grey). */
function greyPixels(lo: number, hi: number, count = 4000): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    const v = Math.round(lo + ((hi - lo) * i) / (count - 1));
    data.set([v, v, v, 255], i * 4);
  }
  return data;
}

describe("brightening dim and faded photos", () => {
  it("leaves a well exposed page alone", () => {
    const data = greyPixels(20, 240);
    const before = data.slice();
    expect(enhanceForReading(data)).toBe(false);
    expect(data).toEqual(before);
  });

  it("stretches a dim photo, but never by more than 2.5 times", () => {
    const { hist, total } = brightnessHistogram(greyPixels(10, 90), 1);
    const levels = levelsFor(hist, total)!;
    expect(levels.gain).toBe(MAX_GAIN);
    const data = greyPixels(10, 90);
    expect(enhanceForReading(data)).toBe(true);
    expect(data[0]).toBeLessThanOrEqual(5);
    expect(data[data.length - 4]).toBeGreaterThan(190);
  });

  it("gives a faded receipt dark text and white paper", () => {
    const data = greyPixels(130, 225);
    expect(enhanceForReading(data)).toBe(true);
    expect(data[0]).toBeLessThanOrEqual(5);
    expect(data[data.length - 4]).toBeGreaterThanOrEqual(235);
  });

  it("keeps colour and leaves transparency untouched", () => {
    const data = new Uint8ClampedArray([100, 50, 150, 128]);
    applyLevels(data, { lo: 50, gain: 2 });
    expect(Array.from(data)).toEqual([100, 0, 200, 128]);
  });
});

describe("bestOfBurst", () => {
  it("keeps the sharpest frame and releases the others", async () => {
    const scores = [3, 9, 4, 7];
    let next = 0;
    const released: number[] = [];
    const result = await bestOfBurst(
      () => next++,
      (i) => scores[i]!,
      4,
      async () => undefined,
      (i) => released.push(i),
    );
    expect(result).toEqual({ item: 1, index: 1 });
    expect(released.sort()).toEqual([0, 2, 3]);
  });

  it("takes one frame without scoring when a burst is not asked for", async () => {
    let scored = false;
    const result = await bestOfBurst(() => "only", () => ((scored = true), 1), 1, async () => undefined);
    expect(result.item).toBe("only");
    expect(scored).toBe(false);
  });
});
