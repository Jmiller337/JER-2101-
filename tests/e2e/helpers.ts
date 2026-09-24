import { expect, type Page } from "@playwright/test";
import { installFakeSpeech } from "./fakeSpeech";

export const PASSCODE = "e2e-passcode";

export async function openApp(page: Page, opts: { mode?: "readAloud" | "voiceOver"; passcode?: boolean } = {}) {
  await page.addInitScript(installFakeSpeech);
  if (opts.mode || opts.passcode) {
    await page.addInitScript(
      ([mode, passcode]) => {
        if (mode) {
          localStorage.setItem(
            "docreader.settings.v1",
            JSON.stringify({ mode, rate: 1, voiceURI: null, autoCapture: true, guidance: "full", sounds: true }),
          );
        }
        if (passcode) localStorage.setItem("docreader.passcode.v1", JSON.stringify(passcode));
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
