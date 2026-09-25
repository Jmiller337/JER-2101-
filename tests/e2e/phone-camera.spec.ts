import { expect, test } from "@playwright/test";
import { announcements, expectAnnounced, expectSpoken, openApp, openToCamera } from "./helpers";

test("a photo from the phone's own camera is read like a capture", async ({ page }) => {
  await openToCamera(page);
  await page.getByTestId("phone-camera-input").setInputFiles("tests/fixtures/pages/letter-photo.jpg");
  await expectSpoken(page, "Got it. Reading.");
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
});

test("when the camera is refused, the phone camera becomes the main button", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("denied", "NotAllowedError"));
  });
  await openApp(page, { settings: { mode: "voiceOver", autoCapture: true }, passcode: true });
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expectAnnounced(
    page,
    "I can't use the camera. In Settings, open Safari, then Camera, and choose Allow. Then come back here.",
    "alert",
  );
  await expect(page.getByRole("button", { name: "Capture" })).toHaveCount(0);
  const fallback = page.getByRole("button", { name: "Use phone camera instead" });
  await expect(fallback).toBeVisible();
  const box = await fallback.boundingBox();
  expect(box!.height).toBeGreaterThan(150);
  expect((await announcements(page)).filter((a) => a.includes("Camera ready"))).toEqual([]);
});

test("inside another app's browser, it asks for Safari", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", {
      get: () =>
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0",
    });
    Object.defineProperty(navigator, "mediaDevices", { get: () => undefined });
  });
  await openApp(page, { settings: { mode: "voiceOver" }, passcode: true });
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expectAnnounced(page, "Please open this page in Safari.", "alert");
});
