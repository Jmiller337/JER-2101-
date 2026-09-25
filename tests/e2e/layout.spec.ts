import { expect, test } from "@playwright/test";
import { openToCamera } from "./helpers";

for (const viewport of [
  { name: "iPhone SE", width: 375, height: 667 - 120 },
  { name: "iPhone 15", width: 393, height: 852 - 140 },
]) {
  test(`the Capture button is fully visible on a ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openToCamera(page);
    await expect(page.getByTestId("camera-status")).toContainText("Place the document in range");
    const box = await page.getByRole("button", { name: "Capture" }).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    expect(box!.height).toBeGreaterThanOrEqual(112);
  });
}
