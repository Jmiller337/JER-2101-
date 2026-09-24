import { test } from "@playwright/test";
import { cameraVideo, expectSpoken, openToCamera } from "./helpers";

test.use({ launchOptions: cameraVideo("dark-room") });

test("framing guidance says it is too dark", async ({ page }) => {
  await openToCamera(page, "readAloud", { autoCapture: true });
  await expectSpoken(page, "Too dark. Turn on a light.");
});
