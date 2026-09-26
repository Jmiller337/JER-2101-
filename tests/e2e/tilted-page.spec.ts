import { expect, test } from "@playwright/test";
import { cameraVideo, expectSpoken, openToCamera, utterances } from "./helpers";

// A portrait picture of a page turned 12 degrees and running off the bottom, held with a slight
// tremor: the strict framing checks never pass.
test.use({ launchOptions: cameraVideo("tilted-page") });

test("a tilted page running off the picture is still taken once the phone is calm", async ({ page }) => {
  await openToCamera(page, "readAloud", { autoCapture: true });
  await expectSpoken(page, "Got it. Reading.");
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
  // Only the framing cue for a page cut off at the bottom came before it, never a remark.
  const spoken = await utterances(page);
  expect(spoken.indexOf("Got it. Reading.")).toBeGreaterThan(spoken.indexOf("Camera ready."));
  // Nothing is drawn over the picture.
  await expect(page.locator("svg polygon")).toHaveCount(0);
});
