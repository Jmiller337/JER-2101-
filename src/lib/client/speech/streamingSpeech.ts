import { toSpoken } from "../text/normalize";
import { chunkForSpeech, splitSentences } from "../text/sentences";
import type { Speaker } from "./speaker";

/**
 * Speaks text that is still arriving (an answer being streamed), one sentence at a time, as
 * soon as each sentence is complete. The last, possibly unfinished, sentence waits for more text
 * or for finish().
 */
export class StreamingSpeech {
  private buffer = "";
  private readonly queue: string[] = [];
  private speaking = false;
  private finished = false;
  private stopped = false;
  private doneCalled = false;

  constructor(
    private readonly speaker: Pick<Speaker, "speak" | "cancelContent">,
    private readonly opts: { lang: string; rate: () => number; onDone?: () => void },
  ) {}

  push(text: string): void {
    if (this.stopped) return;
    this.buffer += text;
    this.extract(false);
  }

  finish(): void {
    if (this.stopped) return;
    this.finished = true;
    this.extract(true);
  }

  /** Stops speaking and discards anything not yet spoken. */
  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
    if (this.speaking) this.speaker.cancelContent();
    this.speaking = false;
  }

  private extract(final: boolean): void {
    const sentences = splitSentences(this.buffer, this.opts.lang);
    let complete: string[];
    if (final) {
      complete = sentences;
      this.buffer = "";
    } else {
      if (sentences.length < 2) return;
      complete = sentences.slice(0, -1);
      this.buffer = sentences[sentences.length - 1] ?? "";
    }
    for (const sentence of complete) for (const chunk of chunkForSpeech(sentence)) this.queue.push(toSpoken(chunk));
    this.pump();
  }

  private pump(): void {
    if (this.speaking || this.stopped) return;
    const next = this.queue.shift();
    if (next === undefined) {
      if (this.finished && !this.doneCalled) {
        this.doneCalled = true;
        this.opts.onDone?.();
      }
      return;
    }
    this.speaking = true;
    this.speaker.speak(next, {
      priority: "content",
      lang: this.opts.lang,
      rate: this.opts.rate(),
      onEnd: () => {
        this.speaking = false;
        this.pump();
      },
      onInterrupted: () => {
        // An announcement cut in: the answer is still on screen, so stop quietly.
        this.speaking = false;
        this.stopped = true;
      },
    });
  }
}
