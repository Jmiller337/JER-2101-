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
    <main className="flex min-h-dvh flex-col gap-6 bg-ink p-5 text-text">
      <div className="flex items-center gap-3">
        <LockIcon className="h-10 w-10 shrink-0 text-accent" />
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-extrabold tracking-tight">
          Enter the passcode
        </h1>
      </div>
      <form
        className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5"
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
          className="min-h-16 rounded-2xl border-2 border-line-2 bg-ink px-4 text-3xl text-text"
        />
        {passcodeError && (
          <p id="passcode-error" ref={errorRef} tabIndex={-1} className="text-2xl font-semibold text-accent">
            {passcodeError}
          </p>
        )}
        <button
          type="submit"
          aria-disabled={passcodeBusy}
          className="min-h-24 rounded-2xl border-2 border-accent bg-accent text-4xl font-extrabold tracking-tight text-on-accent active:scale-[0.99]"
        >
          {passcodeBusy ? "Checking…" : "Continue"}
        </button>
      </form>
    </main>
  );
}
