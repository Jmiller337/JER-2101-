import { describe, expect, it } from "vitest";
import { isInAppBrowser } from "@/lib/client/camera/camera";
import { targetSize } from "@/lib/client/camera/prepare";

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
  it("scales the long edge down to 2000 pixels", () => {
    expect(targetSize(4032, 3024)).toEqual({ width: 2000, height: 1500 });
    expect(targetSize(1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(targetSize(3024, 4032)).toEqual({ width: 1500, height: 2000 });
  });
});
