import type { ErrorCode } from "./protocol";

/**
 * Where an error happened decides the next step the sentence offers:
 * a failed page read says "press Capture", a failed question says "press Send".
 */
export type ErrorContext = "read" | "ask" | "auth";

const NEXT_STEP: Record<ErrorContext, string> = {
  read: "press Capture to try again",
  ask: "press Send to try again",
  auth: "press Continue to try again",
};

/**
 * One short spoken sentence plus a next step for every error code. Technical detail never goes
 * into these sentences; it goes to the console and to small on-screen text.
 */
export function spokenError(code: ErrorCode, context: ErrorContext = "read"): string {
  const next = NEXT_STEP[context];
  switch (code) {
    case "network":
      return context === "ask"
        ? `I couldn't reach the question service. Check your connection, then ${next}.`
        : `I couldn't reach the reading service. Check your connection, then ${next}.`;
    case "unauthorized":
      return "The passcode was not accepted. Please enter it again.";
    case "forbidden":
      return "This page was opened from an address the app does not accept. Open the app from its usual address.";
    case "too_large":
      return `The picture was too large to send. Please ${next}.`;
    case "bad_request":
      return `Something went wrong sending that. Please ${next}.`;
    case "rate_limited":
      return `The reading service is busy. Wait a moment, then ${next}.`;
    case "overloaded":
      return `The reading service is overloaded right now. Wait a moment, then ${next}.`;
    case "refusal":
      return context === "ask"
        ? "I couldn't answer that question. Try asking it another way."
        : "I couldn't read this page. Try again or try another page.";
    case "empty":
      return context === "ask"
        ? "I didn't get an answer. Please try again."
        : "I couldn't read this page. Try again or try another page.";
    case "not_configured":
      return "The reading service is not set up correctly. The API key or passcode on the server needs checking.";
    case "server":
      return `Something went wrong with the reading service. Please ${next}.`;
  }
}

/** Spoken camera problems (section 4, Screen 0 and 6.1 of the spec). */
export const CAMERA_MESSAGES = {
  denied:
    "I can't use the camera. In Settings, open Safari, then Camera, and choose Allow. Then come back here.",
  inAppBrowser: "Please open this page in Safari.",
  insecure: "The camera needs a secure connection. Open the app from its https address.",
  noCamera: "I can't find a camera on this phone. You can press Use phone camera instead.",
  busy: "The camera is being used by another app. Close it, then come back here.",
  unknown: "I couldn't start the camera. Press Use phone camera instead, or reload the page.",
} as const;
