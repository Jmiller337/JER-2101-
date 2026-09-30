import type { Page } from "@playwright/test";

/**
 * Injected before any script runs: a fake speech recognizer that "hears" the next phrase from
 * `window.__recognitionScript` each time it starts ("" hears nothing), and counts its starts in
 * `window.__recognitionStarts`. Recognition finishes with what it heard when stopped, as the real
 * one does. Chromium ships both names; both are replaced so the app picks up the fake.
 */
export function installFakeRecognition(): void {
  type ResultEvent = { results: { length: number; [i: number]: { 0: { transcript: string }; isFinal: boolean; length: number } } };
  const w = window as unknown as {
    __recognitionScript: string[];
    __recognitionStarts: number;
    webkitSpeechRecognition: unknown;
    SpeechRecognition: unknown;
  };
  w.__recognitionScript = [];
  w.__recognitionStarts = 0;
  class FakeRecognition {
    lang = "";
    interimResults = false;
    continuous = false;
    onresult: ((event: ResultEvent) => void) | null = null;
    onerror: ((event: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    private text = "";
    private sent = false;
    private ended = false;
    start() {
      w.__recognitionStarts += 1;
      this.text = w.__recognitionScript.shift() ?? "";
      setTimeout(() => this.emit(), 150);
    }
    stop() {
      setTimeout(() => {
        this.emit();
        this.finish();
      }, 50);
    }
    abort() {
      setTimeout(() => this.finish(), 0);
    }
    private emit() {
      if (this.sent || this.ended || !this.text) return;
      this.sent = true;
      this.onresult?.({ results: { length: 1, 0: { 0: { transcript: this.text }, isFinal: true, length: 1 } } });
    }
    private finish() {
      if (this.ended) return;
      this.ended = true;
      if (!this.text) this.onerror?.({ error: "no-speech" });
      this.onend?.();
    }
  }
  w.webkitSpeechRecognition = FakeRecognition;
  w.SpeechRecognition = FakeRecognition;
}

/** What the fake recognizer will hear on its next starts, in order. */
export async function willHear(page: Page, ...phrases: string[]) {
  await page.evaluate((list) => (window as unknown as { __recognitionScript: string[] }).__recognitionScript.push(...list), phrases);
}

export async function recognitionStarts(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __recognitionStarts: number }).__recognitionStarts);
}

/**
 * Presses and holds the screen (the middle of it unless a point is given), long enough to start
 * listening and say something, then lets go.
 */
export async function holdScreen(page: Page, opts: { x?: number; y?: number; ms?: number } = {}) {
  const viewport = page.viewportSize() ?? { width: 390, height: 844 };
  await page.mouse.move(opts.x ?? viewport.width / 2, opts.y ?? viewport.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(opts.ms ?? 900);
  await page.mouse.up();
}
