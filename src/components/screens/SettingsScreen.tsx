"use client";

import { useRef } from "react";
import { useController, useFocusRequest, useStore } from "../hooks";
import { Button } from "../ui";

export function SettingsScreen() {
  const controller = useController();
  const settings = useStore(controller.settings);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusRequest(headingRef, "heading");
  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-black p-5 text-white">
      <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold">
        Settings
      </h1>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-2xl font-semibold">How the app talks to you</legend>
        <Button
          label="Read aloud (app voice)"
          aria-pressed={settings.mode !== "voiceOver"}
          variant={settings.mode !== "voiceOver" ? "primary" : "secondary"}
          onClick={() => controller.setMode("readAloud")}
        />
        <Button
          label="VoiceOver (I use a screen reader)"
          aria-pressed={settings.mode === "voiceOver"}
          variant={settings.mode === "voiceOver" ? "primary" : "secondary"}
          onClick={() => controller.setMode("voiceOver")}
        />
      </fieldset>
      <Button label="Back" size="huge" variant="primary" onClick={() => controller.closeSettings()} className="mt-auto" />
    </main>
  );
}
