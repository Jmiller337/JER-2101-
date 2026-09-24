import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import { installFakeSpeech } from "./fakeSpeech";

export const PASSCODE = "e2e-passcode";

export async function openApp(page: Page, opts: { mode?: "readAloud" | "voiceOver"; passcode?: boolean } = {}) {
  await page.addInitScript(installFakeSpeech);
  if (opts.mode || opts.passcode) {
    await page.addInitScript(
      ([mode, passcode]) => {
        // Seed only once, so a reload inside a test keeps what the app saved.
        if (mode && !localStorage.getItem("docreader.settings.v1")) {
          localStorage.setItem(
            "docreader.settings.v1",
            JSON.stringify({ mode, rate: 1, voiceURI: null, autoCapture: true, guidance: "full", sounds: true }),
          );
        }
        if (passcode && !localStorage.getItem("docreader.passcode.v1")) {
          localStorage.setItem("docreader.passcode.v1", JSON.stringify(passcode));
        }
      },
      [opts.mode ?? null, opts.passcode ? PASSCODE : null] as const,
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

/** Returning user in the given mode: Start goes straight to the camera. */
export async function openToCamera(page: Page, mode: "readAloud" | "voiceOver" = "readAloud") {
  await openApp(page, { mode, passcode: true });
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
