import type { SpeechPort } from "./port";

/**
 * - `high`: announcements and errors. Interrupt reading and cues; queue behind another high.
 * - `content`: the reader and streamed answers. Waits behind announcements; replaces cues.
 * - `low`: camera guidance cues. Dropped if anything else is speaking or queued.
 */
export type Priority = "high" | "content" | "low";

export interface SpeakOptions {
  priority: Priority;
  lang?: string;
  rate?: number;
  onStart?(): void;
  /** Finished normally (or the watchdog gave up on it). */
  onEnd?(): void;
  /** Stopped by a higher-priority announcement. Not called when the caller cancels it. */
  onInterrupted?(): void;
  /** The engine reported an error. Defaults to onEnd, so a failing utterance never stalls. */
  onError?(error: string): void;
}

export interface SpeakHandle {
  readonly id: number;
  readonly dropped: boolean;
}

interface Job {
  id: number;
  text: string;
  opts: SpeakOptions;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface SpeakerDeps {
  port: SpeechPort;
  timers: Timers;
  defaultLang: string;
  defaultRate(): number;
  /** Voice to use for a language, or null for the engine default. */
  voiceFor(lang: string): string | null;
}

/** Characters per second at rate 1.0, deliberately slow so the watchdog is generous. */
const WATCHDOG_CHARS_PER_SECOND = 8;
const WATCHDOG_SLACK_MS = 5000;

/**
 * The single owner of the speech engine. Every spoken word in the app goes through here, which
 * is what makes "one channel, never two" enforceable and keeps cues from talking over reading.
 */
export class Speaker {
  private current: Job | null = null;
  private queue: Job[] = [];
  private nextId = 1;
  private watchdog: unknown = null;

  constructor(private readonly deps: SpeakerDeps) {}

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0;
  }

  get currentPriority(): Priority | null {
    return this.current?.opts.priority ?? null;
  }

  speak(text: string, opts: SpeakOptions): SpeakHandle {
    const job: Job = { id: this.nextId++, text: text.trim(), opts };
    if (!job.text) {
      this.deps.timers.setTimeout(() => opts.onEnd?.(), 0);
      return { id: job.id, dropped: false };
    }
    switch (opts.priority) {
      case "low": {
        if (this.current || this.queue.length > 0) return { id: job.id, dropped: true };
        this.start(job);
        break;
      }
      case "high": {
        if (this.current && this.current.opts.priority !== "high") this.interruptCurrent();
        if (this.current) {
          // Queue after other announcements but ahead of waiting content.
          const firstContent = this.queue.findIndex((j) => j.opts.priority !== "high");
          if (firstContent === -1) this.queue.push(job);
          else this.queue.splice(firstContent, 0, job);
        } else {
          this.start(job);
        }
        break;
      }
      case "content": {
        // At most one content job waits; a newer request replaces an older queued one.
        this.queue = this.queue.filter((j) => {
          if (j.opts.priority === "content") {
            j.opts.onInterrupted?.();
            return false;
          }
          return true;
        });
        if (this.current && this.current.opts.priority !== "high") this.interruptCurrent();
        if (!this.current && this.queue.length === 0) this.start(job);
        else this.queue.push(job);
        break;
      }
    }
    return { id: job.id, dropped: false };
  }

  /** Cancels one job (speaking or queued) without calling its callbacks. */
  cancel(id: number): void {
    if (this.current?.id === id) {
      this.stopCurrent();
      this.startNext();
      return;
    }
    this.queue = this.queue.filter((j) => j.id !== id);
  }

  /** Cancels all reading and answer speech (speaking or queued); announcements continue. */
  cancelContent(): void {
    this.queue = this.queue.filter((j) => j.opts.priority !== "content");
    if (this.current?.opts.priority === "content") {
      this.stopCurrent();
      this.startNext();
    }
  }

  /** Silences everything immediately, without callbacks. */
  cancelAll(): void {
    this.queue = [];
    if (this.current) this.stopCurrent();
    else this.deps.port.cancel();
  }

  private start(job: Job): void {
    this.current = job;
    const lang = job.opts.lang ?? this.deps.defaultLang;
    const rate = job.opts.rate ?? this.deps.defaultRate();
    this.deps.port.speak({
      text: job.text,
      lang,
      rate,
      voiceURI: this.deps.voiceFor(lang),
      onStart: () => {
        if (this.current?.id === job.id) job.opts.onStart?.();
      },
      onEnd: () => this.finish(job.id, null),
      onError: (error) => this.finish(job.id, error),
    });
    this.armWatchdog(job, rate);
  }

  private finish(id: number, error: string | null): void {
    if (this.current?.id !== id) return; // an event from a cancelled utterance
    const job = this.current;
    this.clearWatchdog();
    this.current = null;
    if (error && error !== "interrupted" && error !== "canceled" && job.opts.onError) job.opts.onError(error);
    else job.opts.onEnd?.();
    this.startNext();
  }

  private startNext(): void {
    if (this.current) return;
    const next = this.queue.shift();
    if (next) this.start(next);
  }

  private interruptCurrent(): void {
    const job = this.current;
    if (!job) return;
    this.stopCurrent();
    job.opts.onInterrupted?.();
  }

  private stopCurrent(): void {
    this.clearWatchdog();
    this.current = null;
    this.deps.port.cancel();
  }

  private armWatchdog(job: Job, rate: number): void {
    this.clearWatchdog();
    const ms = (job.text.length / (WATCHDOG_CHARS_PER_SECOND * Math.max(rate, 0.5))) * 1000 + WATCHDOG_SLACK_MS;
    this.watchdog = this.deps.timers.setTimeout(() => {
      if (this.current?.id !== job.id) return;
      // The engine never reported the end (a known iOS and Chrome failure). Move on.
      this.deps.port.cancel();
      this.finish(job.id, null);
    }, ms);
  }

  private clearWatchdog(): void {
    if (this.watchdog !== null) {
      this.deps.timers.clearTimeout(this.watchdog);
      this.watchdog = null;
    }
  }
}
