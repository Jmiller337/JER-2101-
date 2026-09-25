import { expect, test } from "@playwright/test";
import { cameraVideo, expectSpoken, openToCamera, outlineGeometry, outlineStates, recordOutline } from "./helpers";

// A portrait picture of a page turned 12 degrees and running off the bottom, held with a slight
// tremor: the strict framing checks never pass.
test.use({ launchOptions: cameraVideo("tilted-page") });

test("follows the tilted page, goes green, and takes the picture", async ({ page }) => {
  await recordOutline(page);
  await openToCamera(page, "readAloud", { autoCapture: true });
  // While the page is being lined up the box is white and follows the page's tilt.
  await expect(page.getByTestId("page-outline")).toHaveAttribute("data-state", "seen");
  await expect
    .poll(async () => {
      const { points } = await outlineGeometry(page);
      if (points.length !== 4) return 0;
      // The slope of the top edge: the page is turned 12 degrees (a slope of about 0.21).
      const top = [...points].sort((a, b) => a.y - b.y).slice(0, 2).sort((a, b) => a.x - b.x);
      return (top[1]!.y - top[0]!.y) / (top[1]!.x - top[0]!.x);
    })
    .toBeGreaterThan(0.12);
  await expectSpoken(page, "Got it. Reading.");
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
  const states = await outlineStates(page);
  expect(states.indexOf("seen")).toBeGreaterThanOrEqual(0);
  expect(states.indexOf("ready")).toBeGreaterThan(states.indexOf("seen"));
});
