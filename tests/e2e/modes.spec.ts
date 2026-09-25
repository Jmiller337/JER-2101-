import { expect, test, type Page } from "@playwright/test";
import {
  announcements,
  expectAnnounced,
  expectNoAxeViolations,
  expectSpoken,
  openToCamera,
  swipe,
  utterances,
} from "./helpers";

// The default fake camera: a page held steady in the middle of the picture.

const PDF_LINE = "PDF. Tap the bottom of the screen to choose a file.";
const PHOTOS_LINE = "Photos. Tap the bottom of the screen to choose a photo.";

async function selectedMode(page: Page) {
  return page.getByRole("tab", { selected: true }).textContent();
}

/** A real finger swipe, through Chromium's touch input. */
async function fingerSwipe(page: Page, direction: "left" | "right") {
  const cdp = await page.context().newCDPSession(page);
  const y = 300;
  const [from, to] = direction === "left" ? [300, 120] : [100, 280];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from, y }] });
  for (let k = 1; k <= 4; k++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from + ((to - from) * k) / 4, y: y + k }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("swiping moves between PDF, Camera, and Photos, and each mode says its name", async ({ page }) => {
  await openToCamera(page);
  expect(await selectedMode(page)).toBe("Camera");

  await swipe(page, "left");
  await expectSpoken(page, PHOTOS_LINE);
  expect(await selectedMode(page)).toBe("Photos");
  await expect(page.getByRole("button", { name: "Choose a photo" })).toBeVisible();

  await swipe(page, "right");
  await expectSpoken(page, "Camera.");
  expect(await selectedMode(page)).toBe("Camera");
  await expect(page.getByRole("button", { name: "Capture" })).toBeVisible();

  await swipe(page, "right");
  await expectSpoken(page, PDF_LINE);
  expect(await selectedMode(page)).toBe("PDF");
  await expect(page.getByRole("button", { name: "Choose a PDF" })).toBeVisible();

  // At the end of the strip nothing changes, and the app says where the user still is.
  const before = (await utterances(page)).filter((u) => u === PDF_LINE).length;
  await swipe(page, "right");
  await expect.poll(async () => (await utterances(page)).filter((u) => u === PDF_LINE).length).toBe(before + 1);
  expect(await selectedMode(page)).toBe("PDF");
});

test("a finger swipe works too, and a swipe that starts on the Capture panel does not take a picture", async ({ page }) => {
  await openToCamera(page);
  await fingerSwipe(page, "left");
  await expectSpoken(page, PHOTOS_LINE);
  await fingerSwipe(page, "right");
  await expectSpoken(page, "Camera.");

  const capture = (await page.getByRole("button", { name: "Capture" }).boundingBox())!;
  await swipe(page, "left", { x: capture.x + capture.width * 0.7, y: capture.y + capture.height / 2 });
  await expect(page.getByRole("tab", { name: "Photos" })).toHaveAttribute("aria-selected", "true");
  await page.waitForTimeout(800);
  expect(await utterances(page)).not.toContain("Got it. Reading.");
});

test("tapping a mode switches to it; automatic capture waits for Camera mode", async ({ page }) => {
  await openToCamera(page, "readAloud", { autoCapture: true });
  await page.getByRole("tab", { name: "PDF" }).click();
  await expectSpoken(page, PDF_LINE);
  await expect(page.getByTestId("mode-intro")).toContainText("Read a PDF");
  await expect(page.getByTestId("page-outline")).toHaveAttribute("data-state", "hidden");
  // The page is in view the whole time, but nothing is captured outside Camera mode.
  await page.waitForTimeout(3000);
  expect(await utterances(page)).not.toContain("Got it. Reading.");
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();

  await page.getByRole("tab", { name: "Camera" }).click();
  await expectSpoken(page, "Got it. Reading.");
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
});

test("Photos reads a photo chosen from the library", async ({ page }) => {
  await openToCamera(page);
  await page.getByRole("tab", { name: "Photos" }).click();
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Choose a photo" }).click();
  await (await fileChooser).setFiles("tests/fixtures/pages/letter-photo.jpg");
  await expectSpoken(page, "Got it. Reading.");
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
});

test("the swipe is mentioned until the user has changed mode once", async ({ page }) => {
  await openToCamera(page, "readAloud", { modesLearned: false });
  await expectSpoken(page, "Camera ready. Swipe left or right for PDF and Photos.");
  await swipe(page, "left");
  await expectSpoken(page, PHOTOS_LINE);

  await page.reload();
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expectSpoken(page, "Camera ready.");
  expect(await utterances(page)).not.toContain("Camera ready. Swipe left or right for PDF and Photos.");
});

test("with VoiceOver the modes are tabs that VoiceOver reads, and the app adds nothing", async ({ page }) => {
  await openToCamera(page, "voiceOver", { modesLearned: false });
  await expectAnnounced(page, "Camera ready.");
  await expect(page.getByRole("tablist", { name: "Modes" })).toBeVisible();
  await page.getByRole("tab", { name: "PDF" }).click();
  await expect(page.getByRole("tab", { name: "PDF" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toHaveAccessibleName("PDF");
  await page.waitForTimeout(500);
  expect(await announcements(page)).not.toContain(PDF_LINE);
  expect(await utterances(page)).toEqual([]);
  await expectNoAxeViolations(page, "camera, PDF mode");

  // The arrow keys move between tabs, as in any tab list.
  await page.getByRole("tab", { name: "PDF" }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Camera" })).toBeFocused();
  await expect(page.getByRole("tab", { name: "Camera" })).toHaveAttribute("aria-selected", "true");
});
