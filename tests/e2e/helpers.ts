import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
import { installFakeSpeech } from "./fakeSpeech";

export const PASSCODE = "e2e-passcode";

export interface SeedSettings {
  mode?: "readAloud" | "voiceOver" | null;
  rate?: number;
  autoCapture?: boolean;
  guidance?: "full" | "minimal";
  sounds?: boolean;
  theme?: "light" | "dark" | "contrast";
  /** False to hear the first-run swipe hint on the camera screen. */
  modesLearned?: boolean;
}

/**
 * Records every message written to the live regions, in order, in `window.__announcements`.
 * Messages can be replaced within a second, so tests check this history rather than sampling
 * the region's current text.
 */
export function recordAnnouncements() {
  const log: Array<{ region: string; text: string }> = [];
  (window as unknown as { __announcements: typeof log }).__announcements = log;
  const last: Record<string, string> = {};
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const node = mutation.target;
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const region = el?.closest("[data-testid='live-status'], [data-testid='live-alert']");
      if (!region) continue;
      const name = region.getAttribute("data-testid") === "live-alert" ? "alert" : "status";
      const text = region.textContent ?? "";
      if (text && text !== last[name]) log.push({ region: name, text });
      last[name] = text;
    }
  });
  observer.observe(document, { subtree: true, childList: true, characterData: true });
}

/** Everything announced so far in one live region. */
export async function announcements(page: Page, region: "status" | "alert" = "status"): Promise<string[]> {
  return page.evaluate(
    (name) =>
      (window as unknown as { __announcements: Array<{ region: string; text: string }> }).__announcements
        .filter((a) => a.region === name)
        .map((a) => a.text),
    region,
  );
}

/** Waits until a live region has announced the text (VoiceOver mode). */
export async function expectAnnounced(page: Page, text: string | RegExp, region: "status" | "alert" = "status") {
  try {
    await expect
      .poll(async () => (await announcements(page, region)).some((a) => (typeof text === "string" ? a === text : text.test(a))), {
        message: `expected the ${region} region to announce ${String(text)}`,
      })
      .toBe(true);
  } catch (err) {
    console.log(`Announced so far (${region}):\n  ${(await announcements(page, region)).join("\n  ")}`);
    throw err;
  }
}

/**
 * Opens the app with the fake speech engine. `settings` seeds localStorage (only on the first
 * load, so a reload inside a test keeps what the app saved); `passcode` seeds the passcode.
 */
export async function openApp(page: Page, opts: { settings?: SeedSettings; passcode?: boolean } = {}) {
  await page.addInitScript(installFakeSpeech);
  await page.addInitScript(recordAnnouncements);
  if (opts.settings || opts.passcode) {
    const settings = opts.settings
      ? { mode: null, rate: 1, voiceURI: null, autoCapture: true, guidance: "full", sounds: true, modesLearned: true, ...opts.settings }
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

/** Shows the less-used controls behind "More" on the current screen (or inside `scope`). */
export async function openMore(scope: Page | Locator) {
  const button = scope.getByRole("button", { name: "More" });
  if ((await button.getAttribute("aria-expanded")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-expanded", "true");
}

/** Records every state the box around the page goes through. */
export async function recordOutline(page: Page) {
  await page.addInitScript(() => {
    const states: string[] = [];
    (window as unknown as { __outlineStates: string[] }).__outlineStates = states;
    new MutationObserver((records) => {
      for (const record of records) {
        const el = record.target as Element;
        if (el.getAttribute("data-testid") !== "page-outline") continue;
        const state = el.getAttribute("data-state") ?? "";
        if (states.at(-1) !== state) states.push(state);
      }
    }).observe(document, { attributes: true, attributeFilter: ["data-state"], subtree: true });
  });
}

export function outlineStates(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __outlineStates: string[] }).__outlineStates);
}

/** The box's corners on screen, and where the whole picture lies (partly off screen). */
export function outlineGeometry(page: Page) {
  return page.evaluate(() => {
    const video = document.querySelector("video")!;
    const box = video.getBoundingClientRect();
    // The picture fills the screen and its overflow is cropped (object-fit: cover).
    const scale = Math.max(box.width / video.videoWidth, box.height / video.videoHeight);
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    const svg = document.querySelector('[data-testid="page-outline"]')!.getBoundingClientRect();
    const points = (document.querySelector(".page-outline-line")!.getAttribute("points") ?? "")
      .split(" ")
      .filter(Boolean)
      .map((pair) => pair.split(",").map(Number) as [number, number])
      .map(([x, y]) => ({ x: x + svg.left, y: y + svg.top }));
    return { picture: { x: box.left + (box.width - width) / 2, y: box.top + (box.height - height) / 2, width, height }, points };
  });
}

/**
 * A quick sideways swipe across the camera screen with a mouse (the app treats every pointer
 * alike). "left" moves the finger from right to left, bringing in the mode on the right.
 */
export async function swipe(page: Page, direction: "left" | "right", from?: { x: number; y: number }) {
  const viewport = page.viewportSize()!;
  const start = from ?? { x: viewport.width / 2, y: viewport.height * 0.4 };
  const dx = direction === "left" ? -160 : 160;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + dx / 2, start.y + 4, { steps: 3 });
  await page.mouse.move(start.x + dx, start.y + 6, { steps: 3 });
  await page.mouse.up();
}
