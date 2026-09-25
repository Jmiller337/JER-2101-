import { expect, test } from "@playwright/test";
import { captureAndRead, openMore, openToCamera } from "./helpers";

test("the reading screen starts with only its core controls, the rest behind More", async ({ page }) => {
  await openToCamera(page);
  await captureAndRead(page);
  const controls = page.getByRole("navigation", { name: "Reading controls" });
  const visible = controls.getByRole("button");
  await expect(visible).toHaveText([/Back/, /Play|Pause/, /Forward/, /New document/, /Ask a question/, /More/]);
  await expect(controls.getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "false");
  await openMore(controls);
  for (const name of ["Previous paragraph", "Next paragraph", "Spell the current sentence", "Add page", "Settings"]) {
    await expect(controls.getByRole("button", { name })).toBeVisible();
  }
});

test("the camera screen shows Capture, Open a PDF, and More", async ({ page }) => {
  await openToCamera(page);
  await expect(page.getByRole("button")).toHaveText([/Open a PDF/, /More/, /Capture/]);
  await openMore(page);
  await expect(page.getByRole("button", { name: "Use phone camera instead" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();
});
