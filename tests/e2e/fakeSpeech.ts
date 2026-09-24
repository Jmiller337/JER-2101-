/**
 * Injected into the page before any script runs. Replaces speechSynthesis with a fake that
 * behaves like the real engine (start, end after a short delay, "interrupted" on cancel) and
 * records every utterance in window.__utterances for assertions.
 */
export function installFakeSpeech(): void {
  type Listener = (event: { error?: string }) => void;
  interface FakeUtterance {
    text: string;
    lang: string;
    rate: number;
    volume: number;
    voice: unknown;
    onstart: Listener | null;
    onend: Listener | null;
    onerror: Listener | null;
  }
  const w = window as unknown as {
    __utterances: Array<{ text: string; lang: string; rate: number; at: number }>;
    __speechMsPerChar: number;
    speechSynthesis: unknown;
    SpeechSynthesisUtterance: unknown;
  };
  w.__utterances = [];
  w.__speechMsPerChar = 4;

  class Utterance implements FakeUtterance {
    text: string;
    lang = "";
    rate = 1;
    volume = 1;
    voice: unknown = null;
    onstart: Listener | null = null;
    onend: Listener | null = null;
    onerror: Listener | null = null;
    constructor(text: string) {
      this.text = text;
    }
    addEventListener(type: string, fn: Listener) {
      if (type === "start") this.onstart = fn;
      if (type === "end") this.onend = fn;
      if (type === "error") this.onerror = fn;
    }
  }

  let current: FakeUtterance | null = null;
  let timer: number | null = null;
  const queue: FakeUtterance[] = [];
  const voices = [{ name: "Samantha (Enhanced)", lang: "en-US", voiceURI: "fake.en-US.samantha", default: true, localService: true }];

  const startNext = () => {
    if (current || queue.length === 0) return;
    const u = queue.shift()!;
    current = u;
    if (u.volume > 0 && u.text.trim()) w.__utterances.push({ text: u.text, lang: u.lang, rate: u.rate, at: Date.now() });
    setTimeout(() => u.onstart?.({}), 0);
    timer = window.setTimeout(() => {
      if (current !== u) return;
      current = null;
      u.onend?.({});
      startNext();
    }, Math.max(20, u.text.length * w.__speechMsPerChar));
  };

  const synth = {
    paused: false,
    pending: false,
    get speaking() {
      return current !== null;
    },
    speak(u: FakeUtterance) {
      queue.push(u);
      startNext();
    },
    cancel() {
      queue.length = 0;
      if (timer !== null) clearTimeout(timer);
      const u = current;
      current = null;
      if (u) setTimeout(() => u.onerror?.({ error: "interrupted" }), 0);
    },
    pause() {},
    resume() {},
    getVoices() {
      return voices;
    },
    addEventListener() {},
    removeEventListener() {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  w.SpeechSynthesisUtterance = Utterance;
}
