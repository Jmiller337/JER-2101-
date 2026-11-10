import { expect, test, type Page } from "@playwright/test";
import { expectSpoken, openApp, openToCamera, pressStep, utterances } from "./helpers";

// docs/PROMPT-2.md sections 5 and 6.

const PRIVACY =
  "This app saves nothing. Your photo is sent once to be read, then deleted from the phone. The words are kept only until you start a new document or close the app. Nothing is stored on the server.";

async function openSettingsFromCamera(page: Page) {
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
}

/** The utterances as the fake engine received them, with their rate, pitch, and volume. */
async function spokenWith(page: Page) {
  return page.evaluate(
    () => (window as unknown as { __utterances: Array<{ text: string; rate: number; pitch: number; volume: number }> }).__utterances,
  );
}

test("the first time, the privacy statement is said after the VoiceOver question and before the passcode", async ({ page }) => {
  await openApp(page);
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await page.getByRole("button", { name: /Read aloud to me/ }).click();
  await expectSpoken(page, "Read-aloud mode. I'll speak to you.");
  await expectSpoken(page, PRIVACY);
  await expectSpoken(page, "Enter the passcode, then press Continue.");
  const said = await utterances(page);
  expect(said.indexOf(PRIVACY)).toBeGreaterThan(said.indexOf("Read-aloud mode. I'll speak to you."));
  expect(said.indexOf(PRIVACY)).toBeLessThan(said.indexOf("Enter the passcode, then press Continue."));
});

test("Settings has a Privacy row that is the statement and reads it aloud", async ({ page }) => {
  await openToCamera(page);
  await openSettingsFromCamera(page);
  const row = page.getByRole("button", { name: PRIVACY });
  await expect(row).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Privacy" })).toBeVisible();
  await row.click();
  await expectSpoken(page, PRIVACY);
});

test("the photo is not kept: only the words are, in this tab's storage", async ({ page }) => {
  await openToCamera(page);
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
  const stored = await page.evaluate(() => ({
    session: Object.keys(sessionStorage),
    local: Object.keys(localStorage),
    doc: sessionStorage.getItem("docreader.document.v1") ?? "",
  }));
  expect(stored.doc).toContain("Amount due: $84.12.");
  expect(stored.doc).not.toMatch(/image|base64|jpeg/i);
  expect(stored.local.sort()).toEqual(["docreader.passcode.v1", "docreader.settings.v1"]);
});

test("the speed goes back to 1 each time the app opens", async ({ page }) => {
  await openToCamera(page);
  await openSettingsFromCamera(page);
  await expect(page.getByText("Speed goes back to 1 each time the app opens.")).toBeVisible();
  await pressStep(page, "Faster", 10);
  await expectSpoken(page, "Speed 2.0.");
  await page.reload();
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expectSpoken(page, "Camera ready.");
  expect((await spokenWith(page)).find((u) => u.text === "Camera ready.")?.rate).toBe(1);
  await openSettingsFromCamera(page);
  await expect(page.getByTestId("reading-speed-value")).toHaveText("1.0");
});

test("tone and volume are said as they change, kept, and used for every sentence", async ({ page }) => {
  await openToCamera(page);
  await openSettingsFromCamera(page);
  await pressStep(page, "Higher");
  await expectSpoken(page, "Tone 1.1.");
  await pressStep(page, "Quieter", 2);
  await expectSpoken(page, "Volume 8.");
  const last = (await spokenWith(page)).find((u) => u.text === "Volume 8.");
  expect(last).toMatchObject({ pitch: 1.1, volume: 0.8 });
  await page.reload();
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expectSpoken(page, "Camera ready.");
  expect((await spokenWith(page)).find((u) => u.text === "Camera ready.")).toMatchObject({ pitch: 1.1, volume: 0.8 });
  await openSettingsFromCamera(page);
  await expect(page.getByTestId("tone-value")).toHaveText("1.1");
  await expect(page.getByTestId("volume-value")).toHaveText("8");
});

test("tone and volume stop at their ends and say so", async ({ page }) => {
  await openToCamera(page);
  await openSettingsFromCamera(page);
  await pressStep(page, "Louder");
  await expectSpoken(page, "That is the loudest.");
  await pressStep(page, "Higher", 3);
  await expectSpoken(page, "Tone 1.2.");
  await expectSpoken(page, "That is the highest tone.");
  await pressStep(page, "Lower", 5);
  await expectSpoken(page, "That is the lowest tone.");
  await expect(page.getByTestId("tone-value")).toHaveText("0.8");
});
