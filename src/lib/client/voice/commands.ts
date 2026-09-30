/**
 * What the user can say after holding the screen (docs/PROMPT-2.md section 4). A few fixed
 * phrases are commands; anything else is a question about the page, except for words that look
 * like a command the app does not have ("turn on the flash"), which get the unknown line.
 */
export type Command =
  | "capture"
  | "readEverything"
  | "play"
  | "pause"
  | "next"
  | "back"
  | "nextParagraph"
  | "previousParagraph"
  | "faster"
  | "slower"
  | "spell"
  | "newDocument"
  | "addPage"
  | "settings"
  | "repeat"
  | "help";

/** The phrases for each command, after `normalizeSpoken`. Matched whole, never as a part. */
export const COMMAND_PHRASES: Record<Command, readonly string[]> = {
  capture: ["take a picture", "take the picture", "take a photo", "take the photo", "take picture", "capture", "scan", "scan it", "scan this"],
  readEverything: [
    "read everything",
    "read it all",
    "read all of it",
    "read all",
    "read the whole thing",
    "read the whole page",
    "read the whole document",
    "read the whole letter",
    "read everything to me",
    "read it all to me",
  ],
  play: ["play", "resume", "continue", "keep reading", "go on", "read", "read it", "read this", "read to me", "read it to me", "start reading"],
  pause: ["pause", "stop", "stop reading", "be quiet", "quiet"],
  next: ["next", "forward", "skip", "next sentence", "go forward"],
  back: ["back", "go back", "previous", "previous sentence"],
  nextParagraph: ["next paragraph"],
  previousParagraph: ["previous paragraph", "last paragraph"],
  faster: ["faster", "speed up", "read faster", "go faster"],
  slower: ["slower", "slow down", "read slower", "go slower"],
  spell: ["spell that", "spell it", "spell this", "spell"],
  newDocument: ["new document", "open the camera", "open camera", "start again", "start over"],
  addPage: ["add a page", "add page", "add another page", "another page", "next page"],
  settings: ["settings", "open settings", "go to settings"],
  repeat: ["what did you say", "repeat", "repeat that", "say that again", "say it again", "again", "pardon"],
  help: ["help", "what can i say", "commands"],
};

/** Said for "help", in one breath. */
export const HELP_LINE =
  "You can say: take a picture, read everything, play, pause, next, back, faster, slower, spell that, new document, add a page, settings, or what did you say. Or ask for what you want to know, like the amount due.";
export const NOTHING_HEARD = "I didn't catch that. Hold the screen and try again.";
export const NO_RECOGNITION = "This phone can't hear me. Use the buttons, or type on the Ask screen.";
export const NO_MICROPHONE = "I can't use the microphone. Use the buttons, or type on the Ask screen.";

export function unknownLine(heard: string): string {
  return `I heard: ${heard.trim().replace(/[.!?]+$/, "")}. I don't know that one. Say help for what you can say.`;
}

const LEADING_FILLER = /^(?:please|ok|okay|um+|uh+|er+|hey|so|now|just|can you|could you|would you|will you)\s+/;
const TRAILING_FILLER = /\s+(?:please|now|for me|thanks|thank you)$/;

/** Lower case, no punctuation, single spaces, and the polite words around a command removed. */
export function normalizeSpoken(text: string): string {
  let out = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (let before = ""; before !== out; ) {
    before = out;
    out = out.replace(LEADING_FILLER, "").replace(TRAILING_FILLER, "");
  }
  return out;
}

const PHRASE_TO_COMMAND = new Map<string, Command>(
  (Object.entries(COMMAND_PHRASES) as Array<[Command, readonly string[]]>).flatMap(([command, phrases]) =>
    phrases.map((phrase) => [phrase, command] as [string, Command]),
  ),
);

/** First words of commands the app does not have: "turn on the flash", "call them", "delete it". */
const UNKNOWN_VERBS = new Set([
  "open",
  "close",
  "go",
  "turn",
  "call",
  "dial",
  "send",
  "delete",
  "erase",
  "zoom",
  "switch",
  "set",
  "change",
  "make",
  "save",
  "share",
  "print",
  "email",
  "text",
  "cancel",
  "undo",
  "exit",
  "quit",
  "record",
  "mute",
  "louder",
  "quieter",
  "volume",
  "flash",
]);

export type Heard =
  | { kind: "command"; command: Command }
  | { kind: "unknown" }
  | { kind: "question"; text: string };

export function interpret(text: string): Heard {
  const normalized = normalizeSpoken(text);
  const command = PHRASE_TO_COMMAND.get(normalized);
  if (command) return { kind: "command", command };
  const first = normalized.split(" ")[0] ?? "";
  if (UNKNOWN_VERBS.has(first)) return { kind: "unknown" };
  return { kind: "question", text: text.trim().replace(/\s+/g, " ") };
}

const QUESTION_WORDS =
  /^(?:what|what's|whats|when|who|whose|whom|how|where|which|why|is|are|does|do|did|can|could|should|was|were|will|would|has|have)\b/i;
/** "What is the", "tell me the", "find my" and the like, before the thing asked for. */
const ASKING_FOR =
  /^(?:(?:what(?:'s| is| are| was| were)|whats|tell me|find|look for|read(?: me)?|give me|i want(?: to know)?|i need(?: to know)?)\s+)?(?:the|my)\s+(.+)$/i;

/**
 * The few words said back before a question is used: "the amount due" and "what is the amount
 * due" become "Amount due."; a question that cannot be shortened is said back as it was asked.
 */
export function echoQuestion(text: string): string {
  const cleaned = text.trim().replace(/\s+/g, " ").replace(/[?.!,]+$/, "");
  if (!cleaned) return "";
  const thing = ASKING_FOR.exec(cleaned)?.[1];
  if (thing) return `${capitalize(thing)}.`;
  return `${capitalize(cleaned)}${QUESTION_WORDS.test(cleaned) ? "?" : "."}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
