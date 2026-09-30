import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  COMMAND_PHRASES,
  echoQuestion,
  HELP_LINE,
  interpret,
  normalizeSpoken,
  unknownLine,
  type Command,
} from "@/lib/client/voice/commands";
import { HOLD, HoldGesture } from "@/lib/client/voice/hold";

describe("hold to talk", () => {
  let events: string[];
  let gesture: HoldGesture;

  beforeEach(() => {
    vi.useFakeTimers();
    events = [];
    gesture = new HoldGesture(
      { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>) },
      { onStart: () => events.push("start"), onEnd: () => events.push("end"), onCancel: () => events.push("cancel") },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts listening after the finger has been still for 400 ms, and ends on lift", () => {
    gesture.down(100, 100, 1);
    vi.advanceTimersByTime(HOLD.startMs - 1);
    expect(events).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(events).toEqual(["start"]);
    expect(HOLD.startMs).toBe(400);
    // A little tremor while holding is fine.
    gesture.move(106, 104, 1);
    expect(gesture.up(1, 5000)).toBe(true);
    expect(events).toEqual(["start", "end"]);
  });

  it("stops listening by itself after 8 seconds, and the lift after that does nothing more", () => {
    gesture.down(100, 100, 1);
    vi.advanceTimersByTime(HOLD.startMs + HOLD.maxMs - 1);
    expect(events).toEqual(["start"]);
    vi.advanceTimersByTime(1);
    expect(events).toEqual(["start", "end"]);
    expect(HOLD.maxMs).toBe(8000);
    expect(gesture.up(1, 20_000)).toBe(true);
    expect(events).toEqual(["start", "end"]);
  });

  it("leaves a tap alone: lifted before 400 ms, nothing starts and the click counts", () => {
    gesture.down(100, 100, 1);
    vi.advanceTimersByTime(200);
    expect(gesture.up(1, 1200)).toBe(false);
    vi.advanceTimersByTime(HOLD.maxMs);
    expect(events).toEqual([]);
    expect(gesture.swallowClick(1210)).toBe(false);
  });

  it("leaves swipes and scrolls alone: moving before 400 ms is not a hold", () => {
    gesture.down(100, 100, 1);
    vi.advanceTimersByTime(100);
    gesture.move(100 + HOLD.slop + 1, 100, 1);
    vi.advanceTimersByTime(HOLD.maxMs);
    expect(gesture.up(1, 3000)).toBe(false);
    expect(events).toEqual([]);
  });

  it("cancels when the finger slides away while listening", () => {
    gesture.down(100, 100, 1);
    vi.advanceTimersByTime(HOLD.startMs);
    gesture.move(100, 100 + HOLD.cancelDistance - 1, 1);
    expect(events).toEqual(["start"]);
    gesture.move(100 + HOLD.cancelDistance + 1, 100, 1);
    expect(events).toEqual(["start", "cancel"]);
    expect(gesture.holding).toBe(true);
    // Lifting the finger afterwards neither ends again nor counts as a tap.
    expect(gesture.up(1, 3000)).toBe(true);
    vi.advanceTimersByTime(HOLD.maxMs);
    expect(events).toEqual(["start", "cancel"]);
  });

  it("swallows the click that follows a hold, so a hold on a button is not a press", () => {
    gesture.down(100, 100, 1);
    vi.advanceTimersByTime(HOLD.startMs);
    expect(gesture.up(1, 1000)).toBe(true);
    expect(gesture.swallowClick(1000 + HOLD.clickGraceMs)).toBe(true);
    expect(gesture.swallowClick(1001 + HOLD.clickGraceMs)).toBe(false);
  });

  it("does not swallow a real tap that comes soon after a hold", () => {
    gesture.down(100, 100, 1);
    vi.advanceTimersByTime(HOLD.startMs);
    expect(gesture.up(1, 1000)).toBe(true);
    // A quick tap on Capture right after letting go.
    gesture.down(150, 700, 2);
    expect(gesture.up(2, 1150)).toBe(false);
    expect(gesture.swallowClick(1160)).toBe(false);
  });

  it("is cancelled by a second finger or by the browser taking the touch", () => {
    gesture.down(100, 100, 1);
    gesture.down(200, 200, 2);
    vi.advanceTimersByTime(HOLD.startMs * 2);
    expect(events).toEqual([]);
    gesture.down(100, 100, 3);
    vi.advanceTimersByTime(HOLD.startMs);
    gesture.cancel();
    expect(events).toEqual(["start", "cancel"]);
    expect(gesture.up(3, 5000)).toBe(false);
  });

  it("ignores the lift of another pointer", () => {
    gesture.down(100, 100, 1);
    vi.advanceTimersByTime(HOLD.startMs);
    expect(gesture.up(2, 1000)).toBe(false);
    expect(events).toEqual(["start"]);
    expect(gesture.up(1, 1000)).toBe(true);
    expect(events).toEqual(["start", "end"]);
  });
});

describe("spoken commands", () => {
  const command = (text: string) => {
    const heard = interpret(text);
    return heard.kind === "command" ? heard.command : heard.kind;
  };

  it("knows every command in the spec", () => {
    const expected: Array<[string, Command]> = [
      ["take a picture", "capture"],
      ["capture", "capture"],
      ["scan", "capture"],
      ["read everything", "readEverything"],
      ["read it all", "readEverything"],
      ["read the whole thing", "readEverything"],
      ["play", "play"],
      ["pause", "pause"],
      ["stop", "pause"],
      ["next", "next"],
      ["forward", "next"],
      ["back", "back"],
      ["next paragraph", "nextParagraph"],
      ["previous paragraph", "previousParagraph"],
      ["faster", "faster"],
      ["slower", "slower"],
      ["spell that", "spell"],
      ["new document", "newDocument"],
      ["open the camera", "newDocument"],
      ["start again", "newDocument"],
      ["add a page", "addPage"],
      ["next page", "addPage"],
      ["settings", "settings"],
      ["what did you say", "repeat"],
      ["repeat", "repeat"],
      ["help", "help"],
    ];
    for (const [text, want] of expected) expect(command(text), text).toBe(want);
  });

  it("ignores case, punctuation, and polite words", () => {
    expect(command("Read everything.")).toBe("readEverything");
    expect(command("Please, take a picture!")).toBe("capture");
    expect(command("Okay, um, faster please")).toBe("faster");
    expect(command("Can you spell that for me?")).toBe("spell");
    expect(command("What did you say?")).toBe("repeat");
    expect(normalizeSpoken("  OK   next   page, please ")).toBe("next page");
    expect(normalizeSpoken("What’s the total?")).toBe("what's the total");
  });

  it("matches whole phrases only, so a question that contains a command word is a question", () => {
    expect(interpret("the amount due")).toEqual({ kind: "question", text: "the amount due" });
    expect(interpret("when is the next payment")).toEqual({ kind: "question", text: "when is the next payment" });
    expect(interpret("read me the total")).toEqual({ kind: "question", text: "read me the total" });
    expect(interpret("what is the account number")).toEqual({ kind: "question", text: "what is the account number" });
    expect(interpret("who is it from")).toEqual({ kind: "question", text: "who is it from" });
  });

  it("treats a command the app does not have as unknown, not as a question", () => {
    expect(command("turn on the flash")).toBe("unknown");
    expect(command("call them")).toBe("unknown");
    expect(command("delete this")).toBe("unknown");
    expect(command("open my email")).toBe("unknown");
    expect(unknownLine("turn on the flash")).toBe("I heard: turn on the flash. I don't know that one. Say help for what you can say.");
  });

  it("has no phrase in two commands", () => {
    const all = Object.values(COMMAND_PHRASES).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const phrase of all) expect(normalizeSpoken(phrase)).toBe(phrase);
  });

  it("lists the commands in the help line", () => {
    for (const phrase of ["take a picture", "read everything", "play", "pause", "faster", "slower", "spell that", "new document", "add a page", "settings", "what did you say"]) {
      expect(HELP_LINE).toContain(phrase);
    }
  });
});

describe("saying a question back", () => {
  it("says the thing asked for in a few words", () => {
    expect(echoQuestion("the amount due")).toBe("Amount due.");
    expect(echoQuestion("What is the amount due?")).toBe("Amount due.");
    expect(echoQuestion("what's the due date")).toBe("Due date.");
    expect(echoQuestion("tell me the total")).toBe("Total.");
    expect(echoQuestion("my balance")).toBe("Balance.");
    expect(echoQuestion("the amount and the due date")).toBe("Amount and the due date.");
  });

  it("says a question it cannot shorten as it was asked", () => {
    expect(echoQuestion("who is it from")).toBe("Who is it from?");
    expect(echoQuestion("how much do I owe")).toBe("How much do I owe?");
    expect(echoQuestion("what is this")).toBe("What is this?");
    expect(echoQuestion("account number")).toBe("Account number.");
  });
});
