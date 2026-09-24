"use client";

import { useRef } from "react";
import { useController, useFocusRequest } from "../hooks";

/**
 * First launch: "Do you use VoiceOver?" Two half-screen buttons: yes on top, no on the bottom,
 * matching the spoken question.
 */
export function ModeScreen() {
  const controller = useController();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusRequest(headingRef, "heading");
  return (
    <main className="flex min-h-dvh flex-col gap-4 bg-black p-4">
      <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold text-white">
        Do you use VoiceOver?
      </h1>
      <button
        type="button"
        onClick={() => controller.chooseMode("voiceOver")}
        className="flex flex-1 flex-col items-center justify-center rounded-3xl border-4 border-white bg-neutral-900 p-6 text-center text-4xl font-extrabold text-white"
      >
        I use VoiceOver
        <span className="mt-3 block text-xl font-normal">The app stays quiet and VoiceOver speaks.</span>
      </button>
      <button
        type="button"
        onClick={() => controller.chooseMode("readAloud")}
        className="flex flex-1 flex-col items-center justify-center rounded-3xl border-4 border-yellow-300 bg-yellow-300 p-6 text-center text-4xl font-extrabold text-black"
      >
        Read aloud to me
        <span className="mt-3 block text-xl font-normal">The app speaks everything itself.</span>
      </button>
    </main>
  );
}
