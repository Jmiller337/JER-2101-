import type { Timers } from "../speech/speaker";

/** How long an announcement stays in the region before it is cleared (so it is not found later). */
const CLEAR_AFTER_MS = 10_000;
/** Gap between clearing and re-setting identical text so VoiceOver announces the repeat. */
const REPEAT_GAP_MS = 150;

/**
 * Writes announcements into the two visually hidden live regions (PROMPT.md 6.8): a polite
 * `role="status"` region for progress and cues, and a `role="alert"` region for failures. The
 * regions are rendered once at load and only their text changes. Text is replaced, never
 * appended; a repeat of the same text is cleared first so it is announced again.
 */
export class LiveRegions {
  private statusEl: HTMLElement | null = null;
  private alertEl: HTMLElement | null = null;
  private readonly pending = new Map<HTMLElement, unknown>();

  constructor(private readonly timers: Timers) {}

  attach(statusEl: HTMLElement | null, alertEl: HTMLElement | null): void {
    this.statusEl = statusEl;
    this.alertEl = alertEl;
  }

  status(text: string): void {
    this.write(this.statusEl, text);
  }

  alert(text: string): void {
    this.write(this.alertEl, text);
  }

  private write(el: HTMLElement | null, text: string): void {
    if (!el) return;
    const previous = this.pending.get(el);
    if (previous !== undefined) this.timers.clearTimeout(previous);
    const setText = () => {
      el.textContent = text;
      this.pending.set(
        el,
        this.timers.setTimeout(() => {
          if (el.textContent === text) el.textContent = "";
          this.pending.delete(el);
        }, CLEAR_AFTER_MS),
      );
    };
    if (el.textContent === text) {
      el.textContent = "";
      this.pending.set(el, this.timers.setTimeout(setText, REPEAT_GAP_MS));
    } else {
      setText();
    }
  }
}
