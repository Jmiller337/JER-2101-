import { expect, test } from "@playwright/test";
import { captureAndRead, openMore, openToCamera, utterances } from "./helpers";

test("the reading screen starts with only its core controls, the rest behind More", async ({ page }) => {
  await openToCamera(page);
  await captureAndRead(page);
  // New document and More float at the top; the player floats at the bottom.
  const controls = page.getByRole("navigation", { name: "Reading controls" });
  await expect(controls.getByRole("button")).toHaveText([/Back/, /Play|Pause/, /Forward/, /Ask a question/]);
  await expect(page.getByRole("button", { name: "New document" })).toBeVisible();
  await expect(page.getByRole("button", { name: "More" })).toHaveAttribute("aria-expanded", "false");
  const menu = page.getByRole("group", { name: "More reading controls" });
  await expect(menu).toBeHidden();
  await openMore(page);
  await expect(menu.getByRole("button")).toHaveText(["Previous paragraph", "Next paragraph", "Spell", "Slower", "Faster", "Add page", "Settings"]);
});

test("the camera screen shows only its modes, More, and Capture over the picture", async ({ page }) => {
  await openToCamera(page);
  await expect(page.getByRole("button")).toHaveText([/More/, /Capture/]);
  await expect(page.getByRole("tab")).toHaveText(["PDF", "Camera", "Photos"]);
  await expect(page.getByRole("tab", { name: "Camera" })).toHaveAttribute("aria-selected", "true");
  await openMore(page);
  await expect(page.locator("#more-camera-options").getByRole("button")).toHaveText(["Use phone camera instead", "Settings"]);
});

test("the camera never tells the user where to put the phone", async ({ page }) => {
  await openToCamera(page);
  await expect(page.getByTestId("camera-status")).toHaveText("Camera ready.");
  const spoken = await utterances(page);
  expect(spoken.filter((u) => /place|lay the phone|lift/i.test(u))).toEqual([]);
});
