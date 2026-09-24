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
 * One listening session for a spoken question. The caller stops it (tap again) or it stops by
 * itself after a pause; either way onEnd receives the recognized text.
 */
export class Listener {
  private recognition: RecognitionLike | null = null;
  private text = "";
  private error: string | null = null;

  start(lang: string, callbacks: ListenCallbacks): boolean {
    const Ctor = getCtor();
    if (!Ctor) return false;
    const recognition = new Ctor();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i]![0].transcript;
      this.text = text.trim();
      callbacks.onText(this.text);
    };
    recognition.onerror = (event) => {
      this.error = event.error;
    };
    recognition.onend = () => {
      this.recognition = null;
      callbacks.onEnd(this.text, this.text ? null : this.error);
    };
    try {
      recognition.start();
    } catch {
      return false;
    }
    this.recognition = recognition;
    return true;
  }

  stop(): void {
    this.recognition?.stop();
  }

  abort(): void {
    this.recognition?.abort();
    this.recognition = null;
  }

  get active(): boolean {
    return this.recognition !== null;
  }
}
