import type { SpeechPort, UtteranceRequest, VoiceInfo } from "@/lib/client/speech/port";
import type { Timers } from "@/lib/client/speech/speaker";

/**
 * A speech engine that records utterances and only finishes them when told to. Like Chrome, it
 * reports an "interrupted" error on the utterance it was speaking when cancel() is called.
 */
export class FakeSpeechPort implements SpeechPort {
  available = true;
  voices: VoiceInfo[] = [];
  log: Array<{ text: string; lang: string; rate: number; voiceURI: string | null }> = [];
  current: UtteranceRequest | null = null;
  cancelCount = 0;
  primed = 0;

  speak(request: UtteranceRequest): void {
    this.current = request;
    this.log.push({ text: request.text, lang: request.lang, rate: request.rate, voiceURI: request.voiceURI });
    request.onStart();
  }

  cancel(): void {
    this.cancelCount += 1;
    const current = this.current;
    this.current = null;
    current?.onError("interrupted");
  }

  /** Finishes the current utterance normally. */
  finish(): void {
    const current = this.current;
    this.current = null;
    current?.onEnd();
  }

  /** Finishes utterances one after another until nothing is speaking (or the limit is hit). */
  finishAll(limit = 200): void {
    for (let i = 0; i < limit && this.current; i++) this.finish();
  }

  fail(error: string): void {
    const current = this.current;
    this.current = null;
    current?.onError(error);
  }

  get texts(): string[] {
    return this.log.map((entry) => entry.text);
  }

  get speaking(): string | null {
    return this.current?.text ?? null;
  }

  getVoices(): VoiceInfo[] {
    return this.voices;
  }

  onVoicesChanged(): () => void {
    return () => undefined;
  }

  prime(): void {
    this.primed += 1;
  }
}

/** Timers backed by the global (fake-able) timer functions. */
export const globalTimers: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
