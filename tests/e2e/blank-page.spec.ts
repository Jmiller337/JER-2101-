import { expect, test } from "@playwright/test";
import { cameraVideo, expectSpoken, openToCamera, utterances } from "./helpers";

// A blank sheet of paper held steady: page-shaped, bright, still, and with nothing written on it.
test.use({ launchOptions: cameraVideo("blank-page") });

test("a page with no writing is never photographed automatically, and Capture still works", async ({ page }) => {
  await openToCamera(page, "readAloud", { autoCapture: true });
  await expectSpoken(page, "I can't see any writing.");
  // Well past the forgiving capture's wait: no picture, and no box around the sheet.
  await page.waitForTimeout(5000);
  expect(await utterances(page)).not.toContain("Got it. Reading.");
  await expect(page.getByTestId("page-outline")).toHaveAttribute("data-state", "hidden");
  // Pressing Capture always takes the picture (principle 4).
  await page.getByRole("button", { name: "Capture" }).click();
  await expectSpoken(page, "Got it. Reading.");
});
