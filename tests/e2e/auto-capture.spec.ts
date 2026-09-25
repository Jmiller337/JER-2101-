import { expect, test } from "@playwright/test";
import { cameraVideo, expectSpoken, openToCamera, utterances } from "./helpers";

// The fake camera shows a page held too close (overflowing the frame) with a slight hand tremor:
// the strict framing checks never pass, so the lenient capture must take the picture.
test.use({ launchOptions: cameraVideo("page-too-close") });

test("a page that never frames perfectly is still captured once the phone is held calmly", async ({ page }) => {
  await openToCamera(page, "readAloud", { autoCapture: true });
  await expectSpoken(page, "Lift the phone higher.");
  await expectSpoken(page, "Got it. Reading.");
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
  const spoken = await utterances(page);
  expect(spoken.indexOf("Lift the phone higher.")).toBeLessThan(spoken.indexOf("Got it. Reading."));
});
