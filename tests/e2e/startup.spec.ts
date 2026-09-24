import { expect, test } from "@playwright/test";
import { installFakeSpeech } from "./fakeSpeech";
import { expectSpoken, utterances } from "./helpers";

/** The app's JavaScript files (the stylesheet lives in the same folder and is left alone). */
const appScripts = (url: URL) => url.pathname.startsWith("/_next/static/chunks/") && url.pathname.endsWith(".js");

const COULD_NOT_START =
  "This app could not start. Check the internet connection and reload the page. The app needs iOS 16 or newer.";

test("if the app's code cannot run, tapping Start says so instead of doing nothing", async ({ page }) => {
  await page.addInitScript(installFakeSpeech);
  // Stands in for a phone too old for the app's code, or a download that failed.
  await page.route(appScripts, (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expectSpoken(page, COULD_NOT_START);
  await expect(page.getByRole("alert")).toHaveText(COULD_NOT_START);
});

test("a tap while the app is still loading asks for another tap, then the app starts", async ({ page }) => {
  await page.addInitScript(installFakeSpeech);
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route(appScripts, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const start = page.getByRole("button", { name: "Start. Tap anywhere." });
  await start.click();
  await expectSpoken(page, "Still loading. Tap again in a moment.");

  release();
  await expect(page.locator("#startup-status")).toHaveCount(0);
  await start.click();
  await expectSpoken(page, /^Document Reader\. Do you use VoiceOver\?/);
  expect(await utterances(page)).not.toContain(COULD_NOT_START);
});
