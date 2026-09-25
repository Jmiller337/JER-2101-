import { expect, test, type Page } from "@playwright/test";
import {
  captureAndRead,
  clearUtterances,
  expectAnnounced,
  expectSpoken,
  openMore,
  openToCamera,
  setSpeechSpeed,
  utterances,
} from "./helpers";

async function captureSecondPage(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Add page 2" })).toBeVisible();
  await expectSpoken(page, "Page 2. Place the next page in range of the camera.");
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByTestId("transcript")).toContainText("Ways to pay");
}

test("adding a page after the end says 'Page 2 added' and reads it", async ({ page }) => {
  await openToCamera(page);
  await captureAndRead(page);
  await expectSpoken(page, /^End of document\./);
  await openMore(page);
  await page.getByRole("button", { name: "Add page" }).click();
  await captureSecondPage(page);
  await expectSpoken(page, "Page 2 added.");
  await expectSpoken(page, "Ways to pay");
  await expectSpoken(page, "By mail with the slip below, signed by unclear word Alvarez.");
  await expect(page.getByRole("heading", { level: 2, name: "Page 2" })).toBeVisible();
  await expect
    .poll(async () => (await utterances(page)).filter((u) => u.startsWith("End of document.")).length)
    .toBe(2);
});

test("adding a page while reading continues page 1, then announces the boundary", async ({ page }) => {
  await openToCamera(page);
  await setSpeechSpeed(page, 40);
  await captureAndRead(page);
  await expectSpoken(page, "Riverside Water Utility");
  await openMore(page);
  await page.getByRole("button", { name: "Add page" }).click();
  await setSpeechSpeed(page, 4);
  await captureSecondPage(page);
  await expectSpoken(page, "Page 2.");
  const spoken = await utterances(page);
  const lastPageOne = spoken.lastIndexOf("Call 555-0142, possibly, between 8 a.m. and 5 p.m.");
  const boundary = spoken.indexOf("Page 2.");
  expect(lastPageOne).toBeGreaterThan(-1);
  expect(boundary).toBeGreaterThan(lastPageOne);
  expect(spoken).not.toContain("Page 2 added.");
});

test("asking a question speaks the answer and keeps it on screen", async ({ page }) => {
  await openToCamera(page);
  await captureAndRead(page);
  await page.getByRole("button", { name: "Ask a question" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ask a question" })).toBeVisible();
  await expectSpoken(page, "Ask your question, then press Send. Or press Talk and say it.");
  await page.getByRole("textbox", { name: "Your question" }).fill("How much do I owe?");
  await page.getByRole("button", { name: "Send" }).click();
  await expectSpoken(page, "You owe 84 dollars and 12 cents, and it is due on October 28, 2026.");
  await expectSpoken(page, "Ask another question, or press Back to reading.");
  await expect(page.getByTestId("answers")).toContainText("Question: How much do I owe?");
  await expect(page.getByTestId("answers")).toContainText("Answer: You owe 84 dollars and 12 cents");

  // A follow-up question sends the earlier turn as history (the fake model answers by keyword).
  await page.getByRole("textbox", { name: "Your question" }).fill("What is the phone number?");
  await page.keyboard.press("Enter");
  await expectSpoken(page, /^The phone number is 555-0142/);
  await expect(page.getByTestId("answers").getByRole("listitem")).toHaveCount(2);

  await page.getByRole("button", { name: "Back to reading" }).click();
  await expect(page.getByRole("navigation", { name: "Reading controls" })).toBeVisible();
});

test("a question sent while the last one is still being answered stays in the box", async ({ page }) => {
  await openToCamera(page);
  await captureAndRead(page);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/ask", async (route) => {
    await held;
    await route.continue();
  });
  await page.getByRole("button", { name: "Ask a question" }).click();
  const box = page.getByRole("textbox", { name: "Your question" });
  await box.fill("How much do I owe?");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("button", { name: "Answering…" })).toBeVisible();
  await expect(box).toHaveValue("");

  await box.fill("What is the phone number?");
  await box.press("Enter");
  await expectSpoken(page, "I'm still answering. Wait a moment, then send your question.");
  await expect(box).toHaveValue("What is the phone number?");

  release();
  await expectSpoken(page, "You owe 84 dollars and 12 cents, and it is due on October 28, 2026.");
  await page.getByRole("button", { name: "Send" }).click();
  await expectSpoken(page, /^The phone number is 555-0142/);
  await expect(box).toHaveValue("");
});

test("a spoken question is recognized, confirmed, and answered", async ({ page }) => {
  await page.addInitScript(() => {
    class FakeRecognition {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: ((e: unknown) => void) | null = null;
      onerror: ((e: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        setTimeout(() => this.onresult?.({ results: { length: 1, 0: { 0: { transcript: "How much do I owe" }, isFinal: true, length: 1 } } }), 200);
      }
      stop() {
        setTimeout(() => this.onend?.(), 50);
      }
      abort() {
        setTimeout(() => this.onend?.(), 0);
      }
    }
    // Chromium ships both names; replace both so the app picks up the fake.
    const w = window as unknown as { webkitSpeechRecognition: unknown; SpeechRecognition: unknown };
    w.webkitSpeechRecognition = FakeRecognition;
    w.SpeechRecognition = FakeRecognition;
  });
  await openToCamera(page);
  await captureAndRead(page);
  await page.getByRole("button", { name: "Ask a question" }).click();
  await page.getByRole("button", { name: "Talk: say your question" }).click();
  await expect(page.getByRole("textbox", { name: "Your question" })).toHaveValue("How much do I owe");
  await page.getByRole("button", { name: "Stop and send" }).click();
  await expectSpoken(page, "You asked: How much do I owe");
  await expectSpoken(page, "You owe 84 dollars and 12 cents, and it is due on October 28, 2026.");
});

test("in VoiceOver mode the answer goes to the live region", async ({ page }) => {
  await openToCamera(page, "voiceOver");
  await captureAndRead(page);
  await page.getByRole("button", { name: "Ask a question" }).click();
  await page.getByRole("textbox", { name: "Your question" }).fill("How much do I owe?");
  await page.getByRole("button", { name: "Send" }).click();
  await expectAnnounced(
    page,
    "Answer: You owe 84 dollars and 12 cents, and it is due on October 28, 2026. Ask another question, or press Back to reading.",
  );
  expect(await utterances(page)).toEqual([]);
});

test("New document asks for a second press before clearing", async ({ page }) => {
  await openToCamera(page);
  await captureAndRead(page);
  await clearUtterances(page);
  await page.getByRole("button", { name: "New document" }).click();
  await expectSpoken(page, "Press New document again to clear this document and start a new one.");
  await expect(page.getByTestId("transcript")).toBeVisible();
  await page.getByRole("button", { name: "New document" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
  await expectSpoken(page, "New document.");
});

test("an accidental reload keeps the document", async ({ page }) => {
  await openToCamera(page);
  await captureAndRead(page);
  await page.reload();
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expect(page.getByRole("heading", { level: 1, name: "A water bill from Riverside Water Utility for October" })).toBeVisible();
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
  await expectSpoken(
    page,
    "Your document is still here: A water bill from Riverside Water Utility for October. Press Play to hear it, or New document to start again.",
  );
  await page.getByRole("button", { name: "Play" }).click();
  await expectSpoken(page, "Riverside Water Utility");
});
