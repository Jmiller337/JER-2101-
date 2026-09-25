import { expect, test } from "@playwright/test";
import { captureAndRead, openMore, openToCamera, utterances } from "./helpers";

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

test("the camera screen shows only More and Capture over the picture", async ({ page }) => {
  await openToCamera(page);
  await expect(page.getByRole("button")).toHaveText([/More/, /Capture/]);
  await openMore(page);
  for (const name of ["Open a PDF", "Use phone camera instead", "Settings"]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }
});

test("the camera never tells the user where to put the phone", async ({ page }) => {
  await openToCamera(page);
  await expect(page.getByTestId("camera-status")).toHaveText("Camera ready.");
  const spoken = await utterances(page);
  expect(spoken.filter((u) => /place|lay the phone|lift/i.test(u))).toEqual([]);
});
