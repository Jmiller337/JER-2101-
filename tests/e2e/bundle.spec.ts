import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";

/** The phone may be several years old and on cellular data: keep the app small (principle 10). */
const BUDGET_GZIP_KB = 200;

test(`the app's JavaScript stays under ${BUDGET_GZIP_KB} KB gzipped`, async ({ page }) => {
  const scripts = new Map<string, Buffer>();
  page.on("response", async (response) => {
    if (response.request().resourceType() !== "script") return;
    try {
      scripts.set(response.url(), await response.body());
    } catch {
      // redirects and aborted requests have no body
    }
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start. Tap anywhere." })).toBeVisible();
  await page.waitForLoadState("networkidle");
  let raw = 0;
  let gzip = 0;
  for (const body of scripts.values()) {
    raw += body.length;
    gzip += gzipSync(body).length;
  }
  console.log(`JavaScript: ${scripts.size} files, ${(raw / 1024).toFixed(0)} KB raw, ${(gzip / 1024).toFixed(0)} KB gzipped`);
  expect(gzip / 1024).toBeLessThan(BUDGET_GZIP_KB);
});
