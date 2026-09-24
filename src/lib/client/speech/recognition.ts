/** The part of the (webkit-prefixed on iOS) SpeechRecognition API the app uses. */
interface RecognitionResultList {
  length: number;
  [index: number]: { 0: { transcript: string }; isFinal: boolean; length: number };
}
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => RecognitionLike;

export function recognitionAvailable(): boolean {
  return getCtor() !== null;
}

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface ListenCallbacks {
  onText(text: string): void;
  /** `error` is set when recognition failed ("not-allowed", "no-speech", ...). */
  onEnd(finalText: string, error: string | null): void;
}

/**
 * Listening for a spoken question. Each start() is a fresh session: its recognized text and error
 * belong to that session only, and events from a session that was aborted or replaced are
 * ignored. stop() ends the session and delivers onEnd with the text; abort() discards it and
 * onEnd is never called.
 */
export class Listener {
  private recognition: RecognitionLike | null = null;

  start(lang: string, callbacks: ListenCallbacks): boolean {
    const Ctor = getCtor();
    if (!Ctor) return false;
    this.abort();
    const recognition = new Ctor();
    let text = "";
    let error: string | null = null;
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      if (this.recognition !== recognition) return;
      let heard = "";
      for (let i = 0; i < event.results.length; i++) heard += event.results[i]![0].transcript;
      text = heard.trim();
      callbacks.onText(text);
    };
    recognition.onerror = (event) => {
      if (this.recognition !== recognition) return;
      error = event.error;
    };
    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      this.recognition = null;
      callbacks.onEnd(text, text ? null : error);
    };
    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      this.recognition = null;
      return false;
    }
    return true;
  }

  stop(): void {
    this.recognition?.stop();
  }

  abort(): void {
    const recognition = this.recognition;
    this.recognition = null;
    try {
      recognition?.abort();
    } catch {
      // already ended
    }
  }

  get active(): boolean {
    return this.recognition !== null;
  }
}
