"use client";

import { useRef, useState } from "react";
import { useController, useFocusRequest, useStore } from "../hooks";
import { LockIcon } from "../icons";

export function PasscodeScreen() {
  const controller = useController();
  const { passcodeBusy, passcodeError } = useStore(controller.ui);
  const [value, setValue] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useFocusRequest(headingRef, "heading");
  useFocusRequest(errorRef, "error");
  return (
    <main className="wallpaper flex min-h-dvh flex-col gap-6 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] text-text">
      <div className="flex items-center gap-3">
        <LockIcon className="h-10 w-10 shrink-0 text-accent" />
        <h1 ref={headingRef} tabIndex={-1} className="text-4xl font-bold tracking-tight">
          Enter the passcode
        </h1>
      </div>
      <form
        className="glass flex flex-col gap-5 rounded-[2rem] p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void controller.submitPasscode(value);
        }}
      >
        <label htmlFor="passcode" className="text-2xl font-semibold">
          Passcode
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          autoComplete="current-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-describedby={passcodeError ? "passcode-error" : undefined}
          className="min-h-16 rounded-2xl border-2 border-line-2 bg-surface px-4 text-3xl text-text"
        />
        {passcodeError && (
          <p id="passcode-error" ref={errorRef} tabIndex={-1} className="text-2xl font-semibold text-accent">
            {passcodeError}
          </p>
        )}
        <button
          type="submit"
          aria-disabled={passcodeBusy}
          className="glass-prominent liquid-press min-h-20 rounded-full border-2 border-button-border text-3xl font-bold tracking-tight"
        >
          {passcodeBusy ? "Checking…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
