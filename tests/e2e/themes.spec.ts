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

test("Invert colours swaps light and dark, but not the camera picture, and is remembered", async ({ page }) => {
  await openToCamera(page);
  const filterOf = (selector: string) => page.locator(selector).evaluate((el) => getComputedStyle(el).filter);
  expect(await filterOf("html")).toBe("none");
  await openMore(page);
  await page.getByRole("button", { name: "Settings" }).click();
  const invert = page.getByRole("switch", { name: "Invert colours" });
  await expect(invert).toHaveAttribute("aria-checked", "false");
  await invert.click();
  await expectSpoken(page, "Colours inverted.");
  await expect(invert).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute("data-invert", "");
  expect(await filterOf("html")).toContain("invert(1)");
  await page.reload();
  // Applied by the start-up script, before the app itself has loaded.
  await expect(page.locator("html")).toHaveAttribute("data-invert", "");
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
  // The camera picture is inverted back, so it looks as it really is.
  expect(await filterOf("video")).toContain("invert(1)");
  await openMore(page);
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("switch", { name: "Invert colours" }).click();
  await expectSpoken(page, "Colours not inverted.");
  await expect(page.locator("html")).not.toHaveAttribute("data-invert", "");
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
