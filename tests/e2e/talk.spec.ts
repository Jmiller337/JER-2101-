import { expect, test } from "@playwright/test";
import {
  announcements,
  captureAndRead,
  clearUtterances,
  expectAnnounced,
  expectSpoken,
  openToCamera,
  utterances,
} from "./helpers";
import { holdScreen, installFakeRecognition, recognitionStarts, willHear } from "./talk";

// docs/PROMPT-2.md section 4: hold anywhere on the screen, speak, let go.

const FOLLOW_UP_ANSWERED = "Hold the screen to ask something else, or press Play to hear everything.";
const FOLLOW_UP_OVERVIEW = "What do you want to know? Hold the screen to ask, or press Play to hear everything.";
const FOLLOW_UP_NOT_FOUND = "Try the other side of the page, or press Play to hear everything.";
const NOTHING_HEARD = "I didn't catch that. Hold the screen and try again.";
const NO_RECOGNITION = "This phone can't hear me. Use the buttons, or type on the Ask screen.";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(installFakeRecognition);
});

/** Nothing from the page's own text has been read aloud. */
async function expectNothingOfThePageRead(page: import("@playwright/test").Page) {
  const said = await utterances(page);
  expect(said).not.toContain("Riverside Water Utility");
  expect(said.some((u) => u.includes("Dear Ms. Alvarez"))).toBe(false);
}

test("a question said before the picture is answered after it, and then the app waits", async ({ page }) => {
  await openToCamera(page);
  await willHear(page, "the amount due");
  await holdScreen(page);
  await expectSpoken(page, "Amount due.");
  await clearUtterances(page);
  await page.getByRole("button", { name: "Capture" }).click();
  await expectSpoken(page, "Got it. Looking for the amount due.");
  await expectSpoken(page, "The amount due is $84.12, due October 28, 2026.");
  await expectSpoken(page, FOLLOW_UP_ANSWERED);
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
  await page.waitForTimeout(1500);
  await expectNothingOfThePageRead(page);
});

test("something that is not on the page is said plainly, with what to try next", async ({ page }) => {
  await openToCamera(page);
  await willHear(page, "the account number");
  await holdScreen(page);
  await expectSpoken(page, "Account number.");
  await page.getByRole("button", { name: "Capture" }).click();
  await expectSpoken(page, "Got it. Looking for the account number.");
  await expectSpoken(page, "I can't find the account number on this page.");
  await expectSpoken(page, FOLLOW_UP_NOT_FOUND);
});

test("\"read everything\" reads the whole document from the start", async ({ page }) => {
  await openToCamera(page);
  await captureAndRead(page);
  await expectSpoken(page, FOLLOW_UP_OVERVIEW);
  await clearUtterances(page);
  await willHear(page, "Read everything.");
  await holdScreen(page);
  await expectSpoken(page, "Reading everything.");
  await expectSpoken(page, "A water bill from Riverside Water Utility for October");
  await expectSpoken(page, "Riverside Water Utility");
});

test("a question held on the reading screen is answered from the document", async ({ page }) => {
  await openToCamera(page);
  await captureAndRead(page);
  await expectSpoken(page, FOLLOW_UP_OVERVIEW);
  await willHear(page, "who is it from");
  await holdScreen(page);
  await expectSpoken(page, "Who is it from?");
  await expectSpoken(page, "This is a water bill from Riverside Water Utility for October.");
  await expectSpoken(page, FOLLOW_UP_ANSWERED);
});

test("words that are not a command the app has get the unknown line", async ({ page }) => {
  await openToCamera(page);
  await willHear(page, "turn on the flash");
  await holdScreen(page);
  await expectSpoken(page, "I heard: turn on the flash. I don't know that one. Say help for what you can say.");
});

test("when nothing is heard the app says so", async ({ page }) => {
  await openToCamera(page);
  await willHear(page, "");
  await holdScreen(page);
  await expectSpoken(page, NOTHING_HEARD);
});

test("help lists the commands in one breath", async ({ page }) => {
  await openToCamera(page);
  await willHear(page, "help");
  await holdScreen(page);
  await expectSpoken(page, /^You can say: take a picture, read everything, play, pause/);
});

test("\"what did you say\" says the last thing again", async ({ page }) => {
  await openToCamera(page);
  await captureAndRead(page);
  const overview = "This is a water bill from Riverside Water Utility for October. The amount due is $84.12, due October 28, 2026.";
  await expectSpoken(page, FOLLOW_UP_OVERVIEW);
  await clearUtterances(page);
  await willHear(page, "what did you say");
  await holdScreen(page);
  await expectSpoken(page, overview);
});

test("sliding the finger away cancels, and nothing heard is used", async ({ page }) => {
  await openToCamera(page);
  await willHear(page, "the total");
  await page.mouse.move(195, 400);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.move(195, 560, { steps: 5 });
  await page.mouse.up();
  await expectSpoken(page, "Cancelled.");
  await page.waitForTimeout(800);
  const said = await utterances(page);
  expect(said).not.toContain("Total.");
  expect(said).not.toContain(NOTHING_HEARD);
});

test("a hold on the Capture button is a hold, not a press", async ({ page }) => {
  await openToCamera(page);
  const box = (await page.getByRole("button", { name: "Capture" }).boundingBox())!;
  await willHear(page, "the total");
  await holdScreen(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await expectSpoken(page, "Total.");
  await page.waitForTimeout(1000);
  expect((await utterances(page)).some((u) => u.startsWith("Got it."))).toBe(false);
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
});

test("\"take a picture\" takes it, and \"new document\" goes straight back to the camera", async ({ page }) => {
  await openToCamera(page);
  await willHear(page, "take a picture");
  await holdScreen(page);
  await expectSpoken(page, "Got it. Reading.");
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
  await expectSpoken(page, FOLLOW_UP_OVERVIEW);
  await willHear(page, "new document");
  await holdScreen(page);
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
  await expectSpoken(page, "New document.");
  expect(await utterances(page)).not.toContain("Press New document again to clear this document and start a new one.");
});

test("until she has talked to it three times, the camera says she can hold the screen", async ({ page }) => {
  await openToCamera(page, "readAloud", { talkUses: 0 });
  await expectSpoken(page, "Camera ready. Hold the screen and tell me what you want to know, or just take the picture.");
  for (let i = 1; i <= 3; i++) {
    await willHear(page, "the total");
    await holdScreen(page);
    await expect
      .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("docreader.settings.v1") ?? "{}").talkUses))
      .toBe(i);
  }
  await page.reload();
  await clearUtterances(page);
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expectSpoken(page, "Camera ready.");
});

test("a phone that cannot recognize speech says so once, and the buttons still work", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.webkitSpeechRecognition;
    delete w.SpeechRecognition;
  });
  await openToCamera(page);
  await holdScreen(page);
  await expectSpoken(page, NO_RECOGNITION);
  await holdScreen(page);
  await page.waitForTimeout(500);
  expect((await utterances(page)).filter((u) => u === NO_RECOGNITION)).toHaveLength(1);
  await captureAndRead(page);
});

test("in VoiceOver mode a hold does nothing, and the camera has a Talk button under More", async ({ page }) => {
  await openToCamera(page, "voiceOver");
  await holdScreen(page);
  await page.waitForTimeout(500);
  expect(await recognitionStarts(page)).toBe(0);
  const talk = page.getByRole("button", { name: "Talk: say what to look for, or a command" });
  await expect(talk).toBeVisible();
  // Talk sits under More, against the same edge; More stays in the corner.
  const talkBox = (await talk.boundingBox())!;
  const moreBox = (await page.getByRole("button", { name: "More" }).boundingBox())!;
  expect(talkBox.y).toBeGreaterThanOrEqual(moreBox.y + moreBox.height);
  expect(Math.abs(talkBox.x + talkBox.width - (moreBox.x + moreBox.width))).toBeLessThan(2);
  await willHear(page, "the amount due");
  await talk.click();
  expect(await recognitionStarts(page)).toBe(1);
  await page.getByRole("button", { name: "Stop and send" }).click();
  await expectAnnounced(page, "Amount due.");
  await captureAndRead(page);
  await expectAnnounced(page, "The amount due is $84.12, due October 28, 2026.");
  expect(await utterances(page)).toEqual([]);
  expect(await announcements(page)).not.toContain(FOLLOW_UP_ANSWERED);
});
