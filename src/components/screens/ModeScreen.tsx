"use client";

import { useRef } from "react";
import { useController, useFocusRequest } from "../hooks";
import { EarIcon, SpeakerIcon } from "../icons";

/**
 * First launch: "Do you use VoiceOver?" Two half-screen buttons: yes on top, no on the bottom,
 * matching the spoken question.
 */
export function ModeScreen() {
  const controller = useController();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusRequest(headingRef, "heading");
  return (
    <main className="flex min-h-dvh flex-col gap-4 bg-ink p-4 text-text">
      <div className="px-1 pt-2">
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-extrabold tracking-tight">
          Do you use VoiceOver?
        </h1>
        <p className="mt-1 text-lg text-muted">Tap the top half of the screen for yes, or the bottom half for no.</p>
      </div>
      <button
        type="button"
        onClick={() => controller.chooseMode("voiceOver")}
        className="flex flex-1 flex-col items-center justify-center gap-3 rounded-card border-2 border-line-2 bg-surface-2 p-6 text-center text-4xl font-extrabold tracking-tight text-text active:scale-[0.99]"
      >
        <EarIcon className="h-14 w-14 text-accent" />
        I use VoiceOver
        <span className="block text-xl font-normal text-muted">The app stays quiet and VoiceOver speaks.</span>
      </button>
      <button
        type="button"
        onClick={() => controller.chooseMode("readAloud")}
        className="flex flex-1 flex-col items-center justify-center gap-3 rounded-card border-2 border-accent bg-accent p-6 text-center text-4xl font-extrabold tracking-tight text-on-accent active:scale-[0.99]"
      >
        <SpeakerIcon className="h-14 w-14" />
        Read aloud to me
        <span className="block text-xl font-normal">The app speaks everything itself.</span>
      </button>
    </main>
  );
}
