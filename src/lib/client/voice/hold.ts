import type { Timers } from "../speech/speaker";

/** Hold anywhere to talk (docs/PROMPT-2.md section 4). Distances are CSS pixels. */
export const HOLD = {
  /** A finger held this long without moving starts listening. */
  startMs: 400,
  /** Listening stops by itself after this long, as if the finger had been lifted. */
  maxMs: 8000,
  /** Moving further than this before listening starts makes it a tap, swipe, or scroll. */
  slop: 12,
  /** Sliding this far from where the finger went down while listening cancels. */
  cancelDistance: 80,
  /**
   * The click the browser sends after a hold is swallowed if it comes within this long of the
   * lift, before any new touch (a real tap starts with its own pointer going down).
   */
  clickGraceMs: 600,
} as const;

export interface HoldCallbacks {
  /** The finger has been held still for HOLD.startMs: start listening. */
  onStart(): void;
  /** The finger was lifted, or HOLD.maxMs passed: stop listening and act on what was heard. */
  onEnd(): void;
  /** The finger slid away, or the browser took the touch: stop listening and drop it. */
  onCancel(): void;
}

type State =
  | { kind: "idle" }
  | { kind: "pressing"; id: number; x: number; y: number; timer: unknown }
  | { kind: "listening"; id: number; x: number; y: number; timer: unknown }
  /** Listening ended (cancelled, or the time ran out) but the finger is still down. */
  | { kind: "spent"; id: number };

/**
 * Turns pointer events into a hold: down, 400 ms without moving, then listening until the finger
 * lifts. Taps, swipes, and scrolls are left alone. A hold that started on a button is a hold, not
 * a press: `up` returns true and the click that follows is swallowed (`swallowClick`).
 */
export class HoldGesture {
  private state: State = { kind: "idle" };
  private swallowUntil = -Infinity;

  constructor(
    private readonly timers: Timers,
    private readonly callbacks: HoldCallbacks,
  ) {}

  get listening(): boolean {
    return this.state.kind === "listening";
  }

  /** Listening, or finished listening with the finger still down. */
  get holding(): boolean {
    return this.state.kind === "listening" || this.state.kind === "spent";
  }

  down(x: number, y: number, id: number): void {
    // A new touch: the click it produces is its own, not the tail of the last hold.
    this.swallowUntil = -Infinity;
    // A second finger (a pinch) is never a hold.
    if (this.state.kind !== "idle") {
      this.cancel();
      return;
    }
    const timer = this.timers.setTimeout(() => this.begin(), HOLD.startMs);
    this.state = { kind: "pressing", id, x, y, timer };
  }

  move(x: number, y: number, id: number): void {
    const state = this.state;
    if (state.kind !== "pressing" && state.kind !== "listening") return;
    if (state.id !== id) return;
    const distance = Math.hypot(x - state.x, y - state.y);
    if (state.kind === "pressing" && distance > HOLD.slop) {
      this.timers.clearTimeout(state.timer);
      this.state = { kind: "idle" };
    } else if (state.kind === "listening" && distance > HOLD.cancelDistance) {
      this.timers.clearTimeout(state.timer);
      this.state = { kind: "spent", id };
      this.callbacks.onCancel();
    }
  }

  /** Returns true when the touch was a hold, so the press must not count as a tap. */
  up(id: number, now: number): boolean {
    const state = this.state;
    if (state.kind === "idle" || state.id !== id) return false;
    this.state = { kind: "idle" };
    if (state.kind === "pressing") {
      this.timers.clearTimeout(state.timer);
      return false;
    }
    this.swallowUntil = now + HOLD.clickGraceMs;
    if (state.kind === "listening") {
      this.timers.clearTimeout(state.timer);
      this.callbacks.onEnd();
    }
    return true;
  }

  /** The browser took the touch (a scroll, a system gesture), or a second finger came down. */
  cancel(): void {
    const state = this.state;
    if (state.kind === "pressing" || state.kind === "listening") this.timers.clearTimeout(state.timer);
    this.state = { kind: "idle" };
    if (state.kind === "listening") this.callbacks.onCancel();
  }

  /** Whether a click at `now` is the tail of a hold and must be ignored. */
  swallowClick(now: number): boolean {
    return now <= this.swallowUntil;
  }

  private begin(): void {
    const state = this.state;
    if (state.kind !== "pressing") return;
    const timer = this.timers.setTimeout(() => this.timeUp(), HOLD.maxMs);
    this.state = { kind: "listening", id: state.id, x: state.x, y: state.y, timer };
    this.callbacks.onStart();
  }

  private timeUp(): void {
    const state = this.state;
    if (state.kind !== "listening") return;
    this.state = { kind: "spent", id: state.id };
    this.callbacks.onEnd();
  }
}
