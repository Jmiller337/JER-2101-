import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { installFakeSpeech } from "./fakeSpeech";

export const PASSCODE = "e2e-passcode";

export interface SeedSettings {
  mode?: "readAloud" | "voiceOver" | null;
  rate?: number;
  autoCapture?: boolean;
  guidance?: "full" | "minimal";
  sounds?: boolean;
}

/**
 * Opens the app with the fake speech engine. `settings` seeds localStorage (only on the first
 * load, so a reload inside a test keeps what the app saved); `passcode` seeds the passcode.
 */
export async function openApp(page: Page, opts: { settings?: SeedSettings; passcode?: boolean } = {}) {
  await page.addInitScript(installFakeSpeech);
  if (opts.settings || opts.passcode) {
    const settings = opts.settings
      ? { mode: null, rate: 1, voiceURI: null, autoCapture: true, guidance: "full", sounds: true, ...opts.settings }
      : null;
    await page.addInitScript(
      ([seed, passcode]) => {
        if (seed && !localStorage.getItem("docreader.settings.v1")) {
          localStorage.setItem("docreader.settings.v1", JSON.stringify(seed));
        }
        if (passcode && !localStorage.getItem("docreader.passcode.v1")) {
          localStorage.setItem("docreader.passcode.v1", JSON.stringify(passcode));
        }
      },
      [settings, opts.passcode ? PASSCODE : null] as const,
    );
  }
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Start. Tap anywhere." })).toBeVisible();
}

export async function utterances(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __utterances: Array<{ text: string }> }).__utterances.map((u) => u.text));
}

export async function expectSpoken(page: Page, text: string | RegExp) {
  try {
    await expect
      .poll(async () => (await utterances(page)).some((u) => (typeof text === "string" ? u === text : text.test(u))), {
        message: `expected the app to say ${String(text)}`,
      })
      .toBe(true);
  } catch (err) {
    console.log(`Spoken so far:\n  ${(await utterances(page)).join("\n  ")}`);
    throw err;
  }
}

export async function liveStatus(page: Page): Promise<string> {
  return (await page.getByTestId("live-status").textContent()) ?? "";
}

/** Slows the fake speech engine so a test can interact while a sentence is still being spoken. */
export async function setSpeechSpeed(page: Page, msPerChar: number) {
  await page.evaluate((ms) => ((window as unknown as { __speechMsPerChar: number }).__speechMsPerChar = ms), msPerChar);
}

/** Clears the utterance log so later assertions only see new speech. */
export async function clearUtterances(page: Page) {
  await page.evaluate(() => ((window as unknown as { __utterances: unknown[] }).__utterances.length = 0));
}

/**
 * Returning user in the given mode: Start goes straight to the camera. Automatic capture is off
 * unless asked for, so tests that press Capture are not racing the camera.
 */
export async function openToCamera(page: Page, mode: "readAloud" | "voiceOver" = "readAloud", settings: SeedSettings = {}) {
  await openApp(page, { settings: { mode, autoCapture: false, ...settings }, passcode: true });
  await page.getByRole("button", { name: "Start. Tap anywhere." }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Camera" })).toBeVisible();
}

/** From the camera screen, captures the (fake) page and waits for the transcript. */
export async function captureAndRead(page: Page) {
  await page.getByRole("button", { name: "Capture" }).click();
  await expect(page.getByTestId("transcript")).toContainText("Amount due: $84.12.");
}

/** Runs axe on the current screen and fails with a readable list of violations. */
export async function expectNoAxeViolations(page: Page, screen: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target.join(" ")).join("\n    ")}`,
  );
  expect(summary, `axe violations on the ${screen} screen`).toEqual([]);
}

/** Launch options that feed Chromium's fake camera from one of the generated videos. */
export function cameraVideo(name: string) {
  return {
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=tests/fixtures/camera/${name}.y4m`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  };
}
