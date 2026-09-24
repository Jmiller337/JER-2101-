import { Store } from "../store";
import type { Speaker } from "../speech/speaker";
import type { LiveRegions } from "./liveRegions";

/** Where announcements go: the app's own voice, or the live region for VoiceOver. */
export type Channel = "speech" | "live";

export interface AnnounceOptions {
  /** `high` (default) interrupts reading; `low` is for camera cues and is dropped when busy. */
  priority?: "high" | "low";
  /** Failures go to the alert region in VoiceOver mode. */
  alert?: boolean;
}

/**
 * The single announcement function (PROMPT.md 6.8, principle 1). Each message goes to exactly
 * one channel, chosen by the current mode, never both. The last message is also kept in a store
 * so screens can show it as large visible text.
 */
export class Announcer {
  readonly lastMessage = new Store<string>("");

  constructor(
    private readonly deps: {
      speaker: Pick<Speaker, "speak">;
      live: Pick<LiveRegions, "status" | "alert">;
      channel(): Channel;
      uiLang: string;
    },
  ) {}

  say(text: string, opts: AnnounceOptions = {}): void {
    const message = text.trim();
    if (!message) return;
    this.lastMessage.set(message);
    if (this.deps.channel() === "speech") {
      this.deps.speaker.speak(message, { priority: opts.priority ?? "high", lang: this.deps.uiLang });
    } else if (opts.alert) {
      this.deps.live.alert(message);
    } else {
      this.deps.live.status(message);
    }
  }
}
