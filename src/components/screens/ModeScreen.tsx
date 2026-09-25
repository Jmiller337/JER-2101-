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
    <main className="wallpaper flex min-h-dvh flex-col gap-4 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-text">
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="text-4xl font-bold tracking-tight">
          Do you use VoiceOver?
        </h1>
        <p className="mt-1 text-lg text-muted">Tap the top half of the screen for yes, or the bottom half for no.</p>
      </div>
      <button
        type="button"
        onClick={() => controller.chooseMode("voiceOver")}
        className="glass liquid-press flex flex-1 flex-col items-center justify-center gap-3 rounded-[2.5rem] border-2 border-button-border p-6 text-center text-4xl font-bold tracking-tight text-text"
      >
        <EarIcon className="h-14 w-14 text-accent" />
        I use VoiceOver
        <span className="block text-xl font-normal text-muted">The app stays quiet and VoiceOver speaks.</span>
      </button>
      <button
        type="button"
        onClick={() => controller.chooseMode("readAloud")}
        className="glass liquid-press flex flex-1 flex-col items-center justify-center gap-3 rounded-[2.5rem] border-2 border-button-border p-6 text-center text-4xl font-bold tracking-tight text-text"
      >
        <SpeakerIcon className="h-14 w-14 text-accent" />
        Read aloud to me
        <span className="block text-xl font-normal text-muted">The app speaks everything itself.</span>
      </button>
    </main>
  );
}
