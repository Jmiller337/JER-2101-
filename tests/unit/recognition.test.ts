// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Listener } from "@/lib/client/speech/recognition";

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: ((e: unknown) => void) | null = null;
  onerror: ((e: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {}
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
  say(text: string) {
    this.onresult?.({ results: { length: 1, 0: { 0: { transcript: text }, isFinal: true, length: 1 } } });
  }
}

describe("Listener", () => {
  beforeEach(() => {
    FakeRecognition.instances = [];
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = FakeRecognition;
  });
  afterEach(() => {
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });

  it("delivers the recognized text when stopped", () => {
    const listener = new Listener();
    const onEnd = vi.fn();
    listener.start("en-US", { onText: () => undefined, onEnd });
    FakeRecognition.instances[0]!.say("When is it due");
    listener.stop();
    expect(onEnd).toHaveBeenCalledWith("When is it due", null);
  });

  it("starts each session empty, so silence never re-sends the last question", () => {
    const listener = new Listener();
    listener.start("en-US", { onText: () => undefined, onEnd: () => undefined });
    FakeRecognition.instances[0]!.say("When is it due");
    listener.stop();
    const onEnd = vi.fn();
    listener.start("en-US", { onText: () => undefined, onEnd });
    FakeRecognition.instances[1]!.onerror?.({ error: "no-speech" });
    listener.stop();
    expect(onEnd).toHaveBeenCalledWith("", "no-speech");
  });

  it("ignores events from an aborted session", () => {
    const listener = new Listener();
    const first = vi.fn();
    listener.start("en-US", { onText: () => undefined, onEnd: first });
    const old = FakeRecognition.instances[0]!;
    listener.abort();
    expect(first).not.toHaveBeenCalled();
    const second = vi.fn();
    listener.start("en-US", { onText: () => undefined, onEnd: second });
    old.say("stale words");
    old.onend?.();
    expect(listener.active).toBe(true);
    expect(second).not.toHaveBeenCalled();
  });
});
