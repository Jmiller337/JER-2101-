/** A voice as the app sees it (a plain copy of SpeechSynthesisVoice). */
export interface VoiceInfo {
  name: string;
  lang: string;
  voiceURI: string;
  default: boolean;
  localService: boolean;
}

export interface UtteranceRequest {
  text: string;
  lang: string;
  rate: number;
  voiceURI: string | null;
  onStart(): void;
  onEnd(): void;
  onError(error: string): void;
}

/**
 * The speech engine behind an interface, so the speaker and reader can be tested with a fake.
 * Exactly one utterance is live at a time; the speaker enforces that.
 */
export interface SpeechPort {
  readonly available: boolean;
  speak(request: UtteranceRequest): void;
  cancel(): void;
  getVoices(): VoiceInfo[];
  onVoicesChanged(listener: () => void): () => void;
  /** Speaks a silent utterance. Must be called inside a tap handler to unlock speech on iOS. */
  prime(): void;
}

/** After cancel(), some engines drop an utterance spoken immediately; wait this long first. */
const RESTART_DELAY_MS = 120;

export class BrowserSpeechPort implements SpeechPort {
  private readonly synth: SpeechSynthesis | undefined;
  /**
   * Live utterances are kept referenced here. Some engines garbage-collect an utterance that
   * nothing references while it is still speaking, and then never fire its end event.
   */
  private readonly retained = new Set<SpeechSynthesisUtterance>();
  private lastCancelAt = 0;
  private voicesCache: VoiceInfo[] = [];
  private readonly voiceListeners = new Set<() => void>();

  constructor() {
    this.synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : undefined;
    if (this.synth) {
      this.refreshVoices();
      // iOS and Chrome load voices asynchronously; the list is empty at first.
      this.synth.addEventListener?.("voiceschanged", () => {
        this.refreshVoices();
        for (const listener of [...this.voiceListeners]) listener();
      });
    }
  }

  get available(): boolean {
    return Boolean(this.synth);
  }

  speak(request: UtteranceRequest): void {
    const synth = this.synth;
    if (!synth) {
      request.onError("unavailable");
      return;
    }
    const utterance = new SpeechSynthesisUtterance(request.text);
    utterance.lang = request.lang;
    utterance.rate = request.rate;
    const voice = request.voiceURI ? this.findVoice(request.voiceURI) : undefined;
    if (voice) utterance.voice = voice;
    utterance.onstart = () => request.onStart();
    utterance.onend = () => {
      this.retained.delete(utterance);
      request.onEnd();
    };
    utterance.onerror = (event) => {
      this.retained.delete(utterance);
      request.onError(event.error ?? "error");
    };
    this.retained.add(utterance);

    const go = () => {
      if (!this.retained.has(utterance)) return; // cancelled while waiting
      if (synth.paused) synth.resume();
      synth.speak(utterance);
    };
    const sinceCancel = Date.now() - this.lastCancelAt;
    if (sinceCancel < RESTART_DELAY_MS) setTimeout(go, RESTART_DELAY_MS - sinceCancel);
    else go();
  }

  cancel(): void {
    this.retained.clear();
    this.lastCancelAt = Date.now();
    this.synth?.cancel();
  }

  getVoices(): VoiceInfo[] {
    if (this.voicesCache.length === 0) this.refreshVoices();
    return this.voicesCache;
  }

  onVoicesChanged(listener: () => void): () => void {
    this.voiceListeners.add(listener);
    return () => {
      this.voiceListeners.delete(listener);
    };
  }

  prime(): void {
    const synth = this.synth;
    if (!synth) return;
    try {
      const utterance = new SpeechSynthesisUtterance(" ");
      utterance.volume = 0;
      synth.speak(utterance);
    } catch {
      // ignore
    }
  }

  private refreshVoices(): void {
    try {
      this.voicesCache = (this.synth?.getVoices() ?? []).map((v) => ({
        name: v.name,
        lang: v.lang,
        voiceURI: v.voiceURI,
        default: v.default,
        localService: v.localService,
      }));
    } catch {
      this.voicesCache = [];
    }
  }

  private findVoice(voiceURI: string): SpeechSynthesisVoice | undefined {
    try {
      return this.synth?.getVoices().find((v) => v.voiceURI === voiceURI);
    } catch {
      return undefined;
    }
  }
}
