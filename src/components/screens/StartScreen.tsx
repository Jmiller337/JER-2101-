"use client";

import { useEffect, useRef } from "react";
import { useController } from "../hooks";
import { BrandMark, PlayIcon } from "../icons";

/** Shared markup so the server-rendered page and the live screen look identical. */
export function StartButtonMarkup({
  onStart,
  buttonRef,
}: {
  onStart: (() => void) | undefined;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-ink px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-text">
      <header className="flex items-center gap-4">
        <BrandMark className="h-14 w-14 shrink-0" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Document Reader</h1>
          <p className="text-lg text-muted">Hold a page in front of the camera and listen.</p>
        </div>
      </header>
      <button
        ref={buttonRef}
        type="button"
        data-start="1"
        onClick={onStart}
        className="flex flex-1 flex-col items-center justify-center gap-5 rounded-[2rem] border-2 border-button-border bg-accent px-6 text-center text-5xl font-bold leading-tight tracking-tight text-on-accent active:scale-[0.99]"
      >
        <PlayIcon className="h-16 w-16" />
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
