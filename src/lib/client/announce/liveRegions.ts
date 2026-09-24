import type { Timers } from "../speech/speaker";

/** How long an announcement stays in the region before it is cleared (so it is not found later). */
const CLEAR_AFTER_MS = 10_000;
/** Gap between clearing and re-setting identical text so VoiceOver announces the repeat. */
const REPEAT_GAP_MS = 150;
/** Minimum spacing between two messages, so a second one does not replace the first unheard. */
export const MESSAGE_GAP_MS = 700;
/** Messages waiting beyond this are dropped, oldest first; they would be stale anyway. */
const MAX_QUEUED = 3;

/**
 * Roughly how long VoiceOver takes to read a message at its default rate. A low-priority message
 * (a camera cue) is dropped while the previous one is still being read, just as the app's own
 * voice drops cues while it is speaking.
 */
export function readingTimeMs(text: string): number {
  return Math.min(10_000, 500 + text.length * 55);
}

export type LivePriority = "high" | "low";

interface RegionState {
  queue: string[];
  lastWriteAt: number;
  busyUntil: number;
  timer: unknown;
  clearTimer: unknown;
}

/**
 * Writes announcements into the two visually hidden live regions (PROMPT.md 6.8): a polite
 * `role="status"` region for progress and cues, and a `role="alert"` region for failures. The
 * regions are rendered once at load and only their text changes. Text is replaced, never
 * appended; a repeat of the same text is cleared first so it is announced again; and messages
 * that arrive close together are spaced out so each one is announced.
 */
export class LiveRegions {
  private statusEl: HTMLElement | null = null;
  private alertEl: HTMLElement | null = null;
  private readonly states = new Map<HTMLElement, RegionState>();

  constructor(private readonly timers: Timers) {}

  attach(statusEl: HTMLElement | null, alertEl: HTMLElement | null): void {
    this.statusEl = statusEl;
    this.alertEl = alertEl;
  }

  /** Returns false when a low-priority message was dropped because the region was busy. */
  status(text: string, opts: { priority?: LivePriority } = {}): boolean {
    return this.enqueue(this.statusEl, text, opts.priority ?? "high");
  }

  alert(text: string): void {
    this.enqueue(this.alertEl, text, "high");
  }

  private state(el: HTMLElement): RegionState {
    let state = this.states.get(el);
    if (!state) {
      state = { queue: [], lastWriteAt: -Infinity, busyUntil: -Infinity, timer: null, clearTimer: null };
      this.states.set(el, state);
    }
    return state;
  }

  private enqueue(el: HTMLElement | null, text: string, priority: LivePriority): boolean {
    if (!el) return false;
    const state = this.state(el);
    if (priority === "low" && (state.queue.length > 0 || state.timer !== null || Date.now() < state.busyUntil)) {
      return false;
    }
    if (state.queue[state.queue.length - 1] === text) return true;
    state.queue.push(text);
    if (state.queue.length > MAX_QUEUED) state.queue.splice(0, state.queue.length - MAX_QUEUED);
    this.pump(el, state);
    return true;
  }

  private pump(el: HTMLElement, state: RegionState): void {
    if (state.timer !== null || state.queue.length === 0) return;
    const wait = state.lastWriteAt + MESSAGE_GAP_MS - Date.now();
    if (wait > 0) {
      state.timer = this.timers.setTimeout(() => {
        state.timer = null;
        this.pump(el, state);
      }, wait);
      return;
    }
    const text = state.queue.shift()!;
    const show = () => {
      if (state.clearTimer !== null) this.timers.clearTimeout(state.clearTimer);
      el.textContent = text;
      state.lastWriteAt = Date.now();
      state.busyUntil = state.lastWriteAt + readingTimeMs(text);
      state.clearTimer = this.timers.setTimeout(() => {
        if (el.textContent === text) el.textContent = "";
        state.clearTimer = null;
      }, CLEAR_AFTER_MS);
      this.pump(el, state);
    };
    if (el.textContent === text) {
      el.textContent = "";
      state.timer = this.timers.setTimeout(() => {
        state.timer = null;
        show();
      }, REPEAT_GAP_MS);
    } else {
      show();
    }
  }
}
