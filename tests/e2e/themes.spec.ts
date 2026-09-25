import { expect, test } from "@playwright/test";
import { captureAndRead, expectNoAxeViolations, expectSpoken, openMore, openToCamera } from "./helpers";

test("Settings changes the colours, and the choice survives a reload", async ({ page }) => {
  await openToCamera(page);
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", /dark|contrast/);
  await openMore(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Dark" }).click();
  await expectSpoken(page, "Dark colours.");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  // Applied by the start-up script, before the app itself has loaded.
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

for (const theme of ["dark", "contrast"] as const) {
  test(`the ${theme} theme passes axe on the reading and settings screens`, async ({ page }) => {
    await openToCamera(page, "readAloud", { theme });
    await captureAndRead(page);
    await expectNoAxeViolations(page, `reading (${theme})`);
    await openMore(page);
    await page.getByRole("group", { name: "More reading controls" }).getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expectNoAxeViolations(page, `settings (${theme})`);
  });
}

test("no focus ring is drawn around a heading the app focuses for VoiceOver", async ({ page }) => {
  await openToCamera(page);
  const heading = page.getByRole("heading", { level: 1, name: "Camera" });
  await expect(heading).toBeFocused();
  expect(await heading.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
});

test("a keyboard user still sees where focus is", async ({ page }) => {
  await openToCamera(page);
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toHaveCount(1);
  expect(await focused.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
});
