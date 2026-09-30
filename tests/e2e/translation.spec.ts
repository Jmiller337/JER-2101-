import { expect, test, type Page } from "@playwright/test";
import { expectAnnounced, expectSpoken, openToCamera, pressPlay, utterances } from "./helpers";

// Translation is switched off on the test server (as on a deployment until TRANSLATE_FROM is
// set), so these tests answer the read request with what the server sends once it is on: a
// French letter, written in English, marked as translated from French.

const TITLE = "A letter from the City of Lyon about your property tax";
const TRANSLATED_PAGE = [
  { type: "meta", status: "ok", language: "en", kind: "letter", title: TITLE, translatedFrom: "fr" },
  { type: "answer", text: "This is a letter from the City of Lyon about your property tax. The amount due is 412,00 €, due November 15, 2026." },
  { type: "block", kind: "heading", text: "Ville de Lyon" },
  { type: "block", kind: "paragraph", text: "Dear Madam, your property tax for 2026 is 412,00 €." },
  { type: "block", kind: "label_value", text: "Due date: November 15, 2026." },
  { type: "done", blocks: 3 },
];

async function captureTranslatedPage(page: Page) {
  await page.route("**/api/read", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: TRANSLATED_PAGE.map((event) => JSON.stringify(event)).join("\n") + "\n",
    }),
  );
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByTestId("transcript")).toContainText("Due date: November 15, 2026.");
}

test("a translated page says so before the answer, on screen, and when it is read", async ({ page }) => {
  await openToCamera(page);
  await captureTranslatedPage(page);
  await expectSpoken(page, "Translated from French.");
  await expectSpoken(page, "This is a letter from the City of Lyon about your property tax.");
  const spoken = await utterances(page);
  expect(spoken.indexOf("Translated from French.")).toBeLessThan(
    spoken.indexOf("This is a letter from the City of Lyon about your property tax."),
  );
  await expect(page.getByText("Letter · 1 page · Translated from French")).toBeVisible();
  await pressPlay(page);
  await expectSpoken(page, `${TITLE}. Translated from French.`);
  await expectSpoken(page, "Dear Madam, your property tax for 2026 is 412,00 €.");
});

test("in VoiceOver mode the note comes with the answer, in the live region", async ({ page }) => {
  await openToCamera(page, "voiceOver");
  await captureTranslatedPage(page);
  await expectAnnounced(
    page,
    "Translated from French. This is a letter from the City of Lyon about your property tax. The amount due is 412,00 €, due November 15, 2026.",
  );
  expect(await utterances(page)).toEqual([]);
});

test("a page from the real test server is never marked as translated", async ({ page }) => {
  await openToCamera(page);
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
  await expectSpoken(page, "This is a water bill from Riverside Water Utility for October.");
  expect((await utterances(page)).some((u) => u.includes("Translated"))).toBe(false);
  await expect(page.getByText(/Translated from/)).toHaveCount(0);
});
