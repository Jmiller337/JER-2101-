import { expect, test } from "@playwright/test";
import { captureAndRead, expectSpoken, openApp, openToCamera, PASSCODE, pressPlay, utterances } from "./helpers";

const OVERVIEW = "This is a water bill from Riverside Water Utility for October.";
const FOLLOW_UP_OVERVIEW = "What do you want to know? Hold the screen to ask, or press Play to hear everything.";

test("first launch in read-aloud mode: the page is captured automatically, described, and read on Play", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expectSpoken(page, /^Document Reader\. Do you use VoiceOver\?/);
  await expect(page.getByRole("heading", { level: 1, name: "Do you use VoiceOver?" })).toBeVisible();

  await page.getByRole("button", { name: /Read aloud to me/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Enter the passcode" })).toBeVisible();
  await expectSpoken(page, "Read-aloud mode. I'll speak to you.");
  await expectSpoken(page, /^This app saves nothing\./);
  await expectSpoken(page, "Enter the passcode, then press Continue.");

  await page.getByLabel("Passcode").fill("wrong");
  await page.getByRole("button", { name: "Continue" }).click();
  await expectSpoken(page, "That passcode is not right. Try again.");

  await page.getByLabel("Passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
  // On a first launch the app also mentions holding the screen to talk and the swipe between modes.
  await expectSpoken(
    page,
    "Camera ready. Hold the screen and tell me what you want to know, or just take the picture. Swipe left or right for PDF and Photos.",
  );

  // The fake camera shows a steady, fully visible page: automatic capture fires on its own.
  await expectSpoken(page, "Got it. Reading.");
  await expect(page.getByRole("heading", { level: 1, name: "A water bill from Riverside Water Utility for October" })).toBeVisible();
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
  await expectSpoken(page, OVERVIEW);
  await expectSpoken(page, FOLLOW_UP_OVERVIEW);

  await pressPlay(page);
  await expectSpoken(page, "A water bill from Riverside Water Utility for October");
  await expectSpoken(page, "Riverside Water Utility");
  await expectSpoken(page, "Questions?");
  await expectSpoken(page, "Call 555-0142, possibly, between 8 a.m. and 5 p.m.");
  await expectSpoken(page, /^End of document\./);

  const spoken = await utterances(page);
  const order = [
    "Got it. Reading.",
    OVERVIEW,
    FOLLOW_UP_OVERVIEW,
    "A water bill from Riverside Water Utility for October",
    "Riverside Water Utility",
    "Dear Ms. Alvarez, thank you for being a customer.",
  ];
  const positions = order.map((text) => spoken.indexOf(text));
  expect(positions.every((p) => p >= 0)).toBe(true);
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
});

test("pause reports the position and play resumes", async ({ page }) => {
  await openToCamera(page);
  await page.evaluate(() => ((window as unknown as { __speechMsPerChar: number }).__speechMsPerChar = 60));
  await captureAndRead(page);
  await pressPlay(page);
  await expectSpoken(page, "Riverside Water Utility");
  await page.getByRole("button", { name: "Pause" }).click();
  await expectSpoken(page, /^Paused\. /);
  await page.getByRole("button", { name: "Play" }).click();
  await expectSpoken(page, "Resuming.");
});
