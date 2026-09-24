"use client";

import { useRef, useState } from "react";
import { useController, useFocusRequest, useStore } from "../hooks";
import { Button } from "../ui";

export function PasscodeScreen() {
  const controller = useController();
  const { passcodeBusy, passcodeError } = useStore(controller.ui);
  const [value, setValue] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useFocusRequest(headingRef, "heading");
  useFocusRequest(errorRef, "error");
  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-black p-5 text-white">
      <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold">
        Enter the passcode
      </h1>
      <form
        className="flex flex-col gap-6"
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
          className="min-h-16 rounded-2xl border-4 border-white bg-neutral-900 px-4 text-3xl text-white"
        />
        {passcodeError && (
          <p id="passcode-error" ref={errorRef} tabIndex={-1} className="text-2xl font-semibold text-yellow-300">
            {passcodeError}
          </p>
        )}
        <button
          type="submit"
          aria-disabled={passcodeBusy}
          className="min-h-24 rounded-2xl border-4 border-yellow-300 bg-yellow-300 text-4xl font-extrabold text-black"
        >
          {passcodeBusy ? "Checking…" : "Continue"}
        </button>
      </form>
      <Button label="Settings" size="normal" onClick={() => controller.openSettings()} className="self-start" />
    </main>
  );
}
