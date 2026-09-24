import { expect, test } from "@playwright/test";
import { captureAndRead, clearUtterances, expectSpoken, openToCamera, setSpeechSpeed, utterances } from "./helpers";

test.describe("reading controls", () => {
  test.beforeEach(async ({ page }) => {
    await openToCamera(page);
    await setSpeechSpeed(page, 80);
    await captureAndRead(page);
    await expectSpoken(page, "Riverside Water Utility");
  });

  test("sentence, paragraph, spell, and speed controls", async ({ page }) => {
    const controls = page.getByRole("navigation", { name: "Reading controls" });

    await clearUtterances(page);
    await controls.getByRole("button", { name: "Next paragraph" }).click();
    await expectSpoken(page, "Dear Ms. Alvarez, thank you for being a customer.");

    await controls.getByRole("button", { name: "Forward one sentence" }).click();
    await expectSpoken(page, "Your October bill is ready.");

    await controls.getByRole("button", { name: "Back one sentence" }).click();
    await expect.poll(async () => (await utterances(page)).filter((u) => u === "Dear Ms. Alvarez, thank you for being a customer.").length).toBe(2);

    await controls.getByRole("button", { name: "Previous paragraph" }).click();
    await expect.poll(async () => (await utterances(page)).at(-1)).toBe("Riverside Water Utility");

    await controls.getByRole("button", { name: "Spell the current sentence" }).click();
    await expectSpoken(page, /^capital R, I, V, E, R, S, I, D, E, space/);
    await expect(controls.getByRole("button", { name: "Play" })).toBeVisible();

    await controls.getByRole("button", { name: /^Faster/ }).click();
    await expectSpoken(page, "Speed 1.1.");
    await controls.getByRole("button", { name: /^Slower/ }).click();
    await controls.getByRole("button", { name: /^Slower/ }).click();
    await expectSpoken(page, "Speed 0.9.");
  });

  test("keyboard shortcuts", async ({ page }) => {
    await page.getByRole("heading", { level: 1 }).focus();
    await page.keyboard.press("Space");
    await expectSpoken(page, /^Paused\. /);
    await clearUtterances(page);
    await page.keyboard.press("ArrowDown");
    await expectSpoken(page, "Dear Ms. Alvarez, thank you for being a customer.");
    await page.keyboard.press("ArrowRight");
    await expectSpoken(page, "Your October bill is ready.");
    await page.keyboard.press("ArrowUp");
    await expect.poll(async () => (await utterances(page)).at(-1)).toBe("Riverside Water Utility");
  });

  test("Settings pauses reading, announces changes, and resumes on return", async ({ page }) => {
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await clearUtterances(page);

    // These tests start with automatic capture off, so the switch turns it on.
    await expect(page.getByRole("switch", { name: "Automatic capture" })).toHaveAttribute("aria-checked", "false");
    await page.getByRole("switch", { name: "Automatic capture" }).click();
    await expectSpoken(page, "Automatic capture on.");
    await expect(page.getByRole("switch", { name: "Automatic capture" })).toHaveAttribute("aria-checked", "true");

    await page.getByRole("button", { name: "Minimal guidance" }).click();
    await expectSpoken(page, "Minimal guidance. I'll only say hold still.");

    await page.getByLabel("Reading speed").fill("1.4");
    await expectSpoken(page, "Speed 1.4.");

    await expect(page.getByLabel("Voice for en")).toContainText("Samantha (Enhanced)");
    await page.getByRole("button", { name: "Preview voice" }).click();
    await expectSpoken(page, "This is how I will read your documents.");

    await page.getByRole("button", { name: "Back to reading" }).click();
    await expectSpoken(page, "Resuming.");

    // Settings persist across a reload.
    await page.reload();
    await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
    await page.getByRole("navigation", { name: "Reading controls" }).getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("switch", { name: "Automatic capture" })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByLabel("Reading speed")).toHaveValue("1.4");
  });
});
