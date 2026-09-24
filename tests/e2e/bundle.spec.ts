import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";

/** The phone may be several years old and on cellular data: keep the app small (principle 10). */
const BUDGET_GZIP_KB = 200;

/**
 * Syntax that Safari before iOS 16.4 cannot parse. One such line anywhere stops the whole app
 * from starting on those phones, so the shipped code must not contain it.
 */
const TOO_NEW: { name: string; pattern: RegExp }[] = [
  { name: "class static block", pattern: /\bstatic\s*\{/ },
  { name: "regular expression lookbehind", pattern: /\(\?<[=!]/ },
];

async function loadScripts(page: import("@playwright/test").Page): Promise<Map<string, Buffer>> {
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
  return scripts;
}

test(`the app's JavaScript stays under ${BUDGET_GZIP_KB} KB gzipped`, async ({ page }) => {
  const scripts = await loadScripts(page);
  let raw = 0;
  let gzip = 0;
  for (const body of scripts.values()) {
    raw += body.length;
    gzip += gzipSync(body).length;
  }
  console.log(`JavaScript: ${scripts.size} files, ${(raw / 1024).toFixed(0)} KB raw, ${(gzip / 1024).toFixed(0)} KB gzipped`);
  expect(gzip / 1024).toBeLessThan(BUDGET_GZIP_KB);
});

test("the app's JavaScript parses on iOS 16", async ({ page }) => {
  const scripts = await loadScripts(page);
  expect(scripts.size).toBeGreaterThan(0);
  const found: string[] = [];
  for (const [url, body] of scripts) {
    const text = body.toString("utf8");
    for (const { name, pattern } of TOO_NEW) {
      const match = pattern.exec(text);
      if (match) found.push(`${name} in ${new URL(url).pathname}: ...${text.slice(Math.max(0, match.index - 40), match.index + 40)}...`);
    }
  }
  expect(found).toEqual([]);
});
