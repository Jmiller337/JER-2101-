import { expect, test } from "@playwright/test";
import { liveStatus, openApp, PASSCODE, utterances } from "./helpers";

test("VoiceOver mode: status goes to the live region and the app voice stays silent", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await page.getByRole("button", { name: /I use VoiceOver/ }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Enter the passcode" })).toBeVisible();
  await expect.poll(() => liveStatus(page)).toBe("Enter the passcode, then press Continue.");

  await page.getByLabel("Passcode").fill(PASSCODE);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
  await expect.poll(() => liveStatus(page)).toMatch(/^Lay the phone flat on the page/);

  // Automatic capture (the fake camera shows a steady page).
  await expect(page.getByRole("heading", { level: 1, name: "A water bill from Riverside Water Utility for October" })).toBeVisible();
  await expect.poll(() => liveStatus(page)).toBe("Page 1 ready. 7 paragraphs. Swipe right to read.");

  // The transcript is plain text for VoiceOver: markers written out, no highlight spans.
  const transcript = page.getByTestId("transcript");
  await expect(transcript).toContainText("Call 555-0142 (possibly) between 8 a.m. and 5 p.m.");
  await expect(transcript.locator("mark")).toHaveCount(0);

  // Focus moved to the document heading so a swipe right starts reading.
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();

  // Only the first-launch question (asked before the mode was known) came from the app voice.
  expect(await utterances(page)).toEqual([
    "Document Reader. Do you use VoiceOver? Tap the top half of the screen for yes, or the bottom half for no.",
  ]);

  // "Play with app voice" turns the reader on for this document only.
  await page.getByRole("button", { name: "Play with app voice" }).click();
  await expect.poll(async () => (await utterances(page)).includes("Riverside Water Utility")).toBe(true);
  await expect(page.getByRole("navigation", { name: "Reading controls" })).toBeVisible();
});
