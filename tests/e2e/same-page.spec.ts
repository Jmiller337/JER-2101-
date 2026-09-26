import { expect, test } from "@playwright/test";
import { expectSpoken, openToCamera, utterances } from "./helpers";

// The default fake camera: a page held steady, still in view after it has been read.

test("the page just read is not photographed again until the view changes", async ({ page }) => {
  await openToCamera(page, "readAloud", { autoCapture: true });
  await expectSpoken(page, "Got it. Reading.");
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");

  await page.getByRole("button", { name: "New document" }).click();
  await page.getByRole("button", { name: "New document" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
  await expectSpoken(page, "This is the page you just read.");
  await page.waitForTimeout(4000);
  expect((await utterances(page)).filter((u) => u === "Got it. Reading.")).toHaveLength(1);
  // Pressing Capture still takes it, if that is what the user wants.
  await page.getByRole("button", { name: "Capture" }).click();
  await expect.poll(async () => (await utterances(page)).filter((u) => u === "Got it. Reading.").length).toBe(2);
});
