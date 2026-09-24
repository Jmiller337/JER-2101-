import { expect, test } from "@playwright/test";
import { captureAndRead, expectNoAxeViolations, openApp, openToCamera, PASSCODE } from "./helpers";

test("every screen passes axe in read-aloud mode", async ({ page }) => {
  // First launch (mode not chosen yet), with automatic capture off so the camera screen stays.
  await openApp(page, { settings: { mode: null, autoCapture: false } });
  await expectNoAxeViolations(page, "start");
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Do you use VoiceOver?" })).toBeVisible();
  await expectNoAxeViolations(page, "mode");
  await page.getByRole("button", { name: /Read aloud to me/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Enter the passcode" })).toBeVisible();
  await expectNoAxeViolations(page, "passcode");
  await page.getByLabel("Passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
  await expectNoAxeViolations(page, "camera");
  await captureAndRead(page);
  await expectNoAxeViolations(page, "reading");
  await page.getByRole("navigation", { name: "Reading controls" }).getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expectNoAxeViolations(page, "settings");
});

test("the reading screen passes axe in VoiceOver mode", async ({ page }) => {
  await openToCamera(page, "voiceOver");
  await captureAndRead(page);
  await expectNoAxeViolations(page, "reading (VoiceOver mode)");
});

test("each screen has exactly one h1", async ({ page }) => {
  await openToCamera(page);
  await expect(page.locator("h1")).toHaveCount(1);
  await captureAndRead(page);
  await expect(page.locator("h1")).toHaveCount(1);
});
