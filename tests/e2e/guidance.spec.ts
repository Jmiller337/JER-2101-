import { expect, test } from "@playwright/test";
import { cameraVideo, expectSpoken, openToCamera, utterances } from "./helpers";

// The fake camera shows: an empty table, then a page cut off on the right sliding in, then the
// whole page shaking, then the page held steady.
test.use({ launchOptions: cameraVideo("page-into-frame") });

test.describe("framing guidance with a page moving into view", () => {
  test("cues in order, then captures automatically", async ({ page }) => {
    await openToCamera(page, "readAloud", { autoCapture: true });
    await expectSpoken(page, "Got it. Reading.");
    const spoken = await utterances(page);
    const order = [
      "I can't see a page.",
      "Move right.",
      "I see the whole page. Hold still.",
      "Got it. Reading.",
    ].map((cue) => spoken.indexOf(cue));
    expect(order.every((i) => i >= 0), `spoken: ${spoken.join(" | ")}`).toBe(true);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
  });

  test("with automatic capture off, it asks the user to press Capture", async ({ page }) => {
    await openToCamera(page, "readAloud", { autoCapture: false });
    await expectSpoken(page, "I see the whole page. Press Capture.");
    await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
  });

  test("minimal guidance only says hold still", async ({ page }) => {
    await openToCamera(page, "readAloud", { autoCapture: true, guidance: "minimal" });
    await expectSpoken(page, "Got it. Reading.");
    const spoken = await utterances(page);
    expect(spoken).not.toContain("I can't see a page.");
    expect(spoken).not.toContain("Move right.");
    expect(spoken).toContain("I see the whole page. Hold still.");
  });
});
