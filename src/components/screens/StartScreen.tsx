"use client";

import { useEffect, useRef } from "react";
import { useController } from "../hooks";

/** Shared markup so the server-rendered page and the live screen look identical. */
export function StartButtonMarkup({
  onStart,
  buttonRef,
}: {
  onStart: (() => void) | undefined;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <main className="flex min-h-dvh flex-col bg-black">
      <h1 className="px-5 pt-5 text-2xl font-bold text-white">Document Reader</h1>
      <button
        ref={buttonRef}
        type="button"
        data-start="1"
        onClick={onStart}
        className="m-4 flex flex-1 items-center justify-center rounded-3xl border-4 border-yellow-300 bg-yellow-300 px-6 text-center text-5xl font-extrabold leading-tight text-black"
      >
        Start. Tap anywhere.
      </button>
    </main>
  );
}

/**
 * Screen 0. One full-screen button: iOS will not play speech until the user has tapped, and the
 * camera permission prompt should be explained before it appears. Focus goes to the button so a
 * VoiceOver double-tap activates it.
 */
export function StartScreen() {
  const controller = useController();
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    buttonRef.current?.focus();
  }, []);
  return <StartButtonMarkup onStart={() => controller.start()} buttonRef={buttonRef} />;
}
