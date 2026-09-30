import { expect, test } from "@playwright/test";
import { captureAndRead, expectSpoken, openToCamera, utterances } from "./helpers";

// docs/PROMPT-2.md section 3: say what it is, or answer what was asked, then wait.

test("with nothing asked, the app says what the document is and its headline fact, then waits", async ({ page }) => {
  await openToCamera(page);
  await captureAndRead(page);
  await expectSpoken(page, "This is a water bill from Riverside Water Utility for October.");
  await expectSpoken(page, "The amount due is $84.12, due October 28, 2026.");
  await expectSpoken(page, "What do you want to know? Hold the screen to ask, or press Play to hear everything.");
  // Nothing of the page's text is read until she asks for it.
  await page.waitForTimeout(1500);
  expect(await utterances(page)).not.toContain("Riverside Water Utility");
  await page.getByRole("navigation", { name: "Reading controls" }).getByRole("button", { name: "Play" }).click();
  await expectSpoken(page, "A water bill from Riverside Water Utility for October");
  await expectSpoken(page, "Riverside Water Utility");
});
