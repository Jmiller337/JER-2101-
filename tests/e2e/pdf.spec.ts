import { expect, test } from "@playwright/test";
import { expectAnnounced, expectSpoken, openMore, openToCamera, utterances } from "./helpers";

const PDF = "tests/fixtures/pages/letter.pdf";
const TITLE = "A two-page letter from Riverside Library about a returned book";

test("a PDF from the phone's files is read aloud, every page, in order", async ({ page }) => {
  await openToCamera(page);
  await openMore(page);
  await expect(page.getByRole("button", { name: "Open a PDF" })).toBeVisible();
  await page.getByTestId("pdf-input").setInputFiles(PDF);
  await expectSpoken(page, "Got it. Reading the PDF.");
  await expect(page.getByRole("heading", { level: 1, name: TITLE })).toBeVisible();
  await expect(page.getByTestId("transcript")).toContainText("Late fee: $2.40.");
  await expect(page.getByRole("heading", { level: 2, name: "Page 2" })).toBeVisible();

  await expectSpoken(page, TITLE);
  await expectSpoken(page, "Page 2.");
  await expectSpoken(page, "You can pay at the front desk or by phone at 555-0199.");
  await expectSpoken(page, /^End of document\./);
  const spoken = await utterances(page);
  const lastOfPageOne = spoken.indexOf("The book was returned on September 3, 2026, eight days late.");
  expect(lastOfPageOne).toBeGreaterThan(-1);
  expect(spoken.indexOf("Page 2.")).toBeGreaterThan(lastOfPageOne);
  // A PDF page cannot be photographed again.
  await expect(page.getByRole("button", { name: /Retake page/ })).toHaveCount(0);
});

test("in VoiceOver mode the PDF is announced without the app voice", async ({ page }) => {
  await openToCamera(page, "voiceOver");
  await page.getByTestId("pdf-input").setInputFiles(PDF);
  await expectAnnounced(page, /^Page 1 ready\./);
  await expectAnnounced(page, "All 2 pages are ready.");
  expect(await utterances(page)).toEqual([]);
});

test("a file that is not a PDF is refused with a reason", async ({ page }) => {
  await openToCamera(page);
  await page.getByTestId("pdf-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expectSpoken(page, "That file is not a PDF. Choose a file whose name ends in .pdf.");
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
});

test("Add page waits until the PDF has been read", async ({ page }) => {
  await openToCamera(page);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/read", async (route) => {
    await held;
    await route.continue();
  });
  await page.getByTestId("pdf-input").setInputFiles(PDF);
  await expectSpoken(page, "Got it. Reading the PDF.");
  // The button is marked unavailable while nothing has arrived; a tap still explains why.
  await openMore(page);
  await page.getByRole("button", { name: "Add page" }).click({ force: true });
  await expectSpoken(page, "Wait a moment, I'm still reading the PDF.");
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toHaveCount(0);
  release();
  await expect(page.getByTestId("transcript")).toContainText("Late fee: $2.40.");
});

test("a PDF the server refuses as too large gets its own message", async ({ page }) => {
  await openToCamera(page);
  await page.route("**/api/read", (route) =>
    route.fulfill({ status: 413, contentType: "application/json", body: '{"error":"too_large"}' }),
  );
  await page.getByTestId("pdf-input").setInputFiles(PDF);
  await expectSpoken(page, "That PDF is too large to send. Try a smaller file.");
});
