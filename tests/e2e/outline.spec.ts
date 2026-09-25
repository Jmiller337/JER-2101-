import { expect, test } from "@playwright/test";
import { cameraVideo, openToCamera, outlineGeometry } from "./helpers";

// A page held steady in the middle of the picture.
test.use({ launchOptions: cameraVideo("static-page") });

test("draws a box around the page and turns it green when the page is ready", async ({ page }) => {
  await openToCamera(page, "readAloud", { autoCapture: false });
  const outline = page.getByTestId("page-outline");
  await expect(outline).toHaveAttribute("data-state", "ready");
  await expect(outline).toHaveAttribute("aria-hidden", "true");
  // The page in the fake video spans 19% to 81% across and 10% to 90% down.
  await expect
    .poll(async () => {
      const { picture, points } = await outlineGeometry(page);
      if (points.length !== 4) return false;
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const near = (a: number, b: number) => Math.abs(a - b) < 6;
      return (
        near(Math.min(...xs), picture.x + 0.19 * picture.width) &&
        near(Math.max(...xs), picture.x + 0.81 * picture.width) &&
        near(Math.min(...ys), picture.y + 0.1 * picture.height) &&
        near(Math.max(...ys), picture.y + 0.9 * picture.height)
      );
    })
    .toBe(true);
});
