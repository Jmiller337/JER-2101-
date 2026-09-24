"use client";

import { useRef } from "react";
import { RATE_MAX, RATE_MIN, RATE_STEP } from "@/lib/client/settings";
import { useController, useFocusRequest, useStore } from "../hooks";
import { Button } from "../ui";

const RETURN_NAMES: Record<string, string> = {
  camera: "camera",
  reading: "reading",
  ask: "questions",
  passcode: "passcode",
  mode: "start",
  start: "start",
  settings: "start",
};

/**
 * Settings (PROMPT.md section 4). Real controls only; every change is announced through the
 * single announcement channel. All values persist in localStorage.
 */
export function SettingsScreen() {
  const controller = useController();
  const settings = useStore(controller.settings);
  const ui = useStore(controller.ui);
  useStore(controller.voices); // re-render when voices finish loading
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusRequest(headingRef, "heading");
  const voices = controller.voiceChoices();
  const current = controller.currentVoice();
  const readAloud = settings.mode !== "voiceOver";

  return (
    <main className="flex min-h-dvh flex-col gap-8 bg-black p-5 pb-12 text-white">
      <div className="flex flex-col gap-4">
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold">
          Settings
        </h1>
        <Button
          label={`Back to ${RETURN_NAMES[ui.returnTo] ?? "start"}`}
          variant="primary"
          size="large"
          onClick={() => controller.closeSettings()}
        />
      </div>

      <section aria-labelledby="mode-heading" className="flex flex-col gap-3">
        <h2 id="mode-heading" className="text-2xl font-semibold">
          How the app talks to you
        </h2>
        <p className="text-xl text-neutral-200">
          Choose VoiceOver if you use a screen reader: the app stays quiet and VoiceOver reads everything.
        </p>
        <Button
          label="Read aloud (app voice)"
          aria-pressed={readAloud}
          variant={readAloud ? "primary" : "secondary"}
          onClick={() => controller.setMode("readAloud")}
        />
        <Button
          label="VoiceOver (I use a screen reader)"
          aria-pressed={!readAloud}
          variant={!readAloud ? "primary" : "secondary"}
          onClick={() => controller.setMode("voiceOver")}
        />
      </section>

      <section aria-labelledby="voice-heading" className="flex flex-col gap-3">
        <h2 id="voice-heading" className="text-2xl font-semibold">
          Voice
        </h2>
        <label htmlFor="voice" className="text-xl">
          Voice for {controller.voiceLanguage()}
        </label>
        <select
          id="voice"
          value={settings.voiceURI && voices.some((v) => v.voiceURI === settings.voiceURI) ? settings.voiceURI : ""}
          onChange={(event) => controller.setVoice(event.target.value || null)}
          className="min-h-16 rounded-2xl border-2 border-white bg-neutral-900 px-3 text-2xl text-white"
        >
          <option value="">Automatic{current ? ` (${current.name})` : ""}</option>
          {voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
        <Button label="Preview voice" onClick={() => controller.previewVoice()} />
        <p className="text-lg text-neutral-300">
          Better voices: on the iPhone open Settings, Accessibility, Spoken Content, Voices, and download an Enhanced or
          Premium voice.
        </p>
      </section>

      <section aria-labelledby="speed-heading" className="flex flex-col gap-3">
        <h2 id="speed-heading" className="text-2xl font-semibold">
          Speed
        </h2>
        <label htmlFor="speed" className="text-xl">
          Reading speed: <span className="font-bold">{settings.rate.toFixed(1)}</span>
        </label>
        <input
          id="speed"
          type="range"
          min={RATE_MIN}
          max={RATE_MAX}
          step={RATE_STEP}
          value={settings.rate}
          aria-valuetext={`Speed ${settings.rate.toFixed(1)}`}
          onChange={(event) => controller.setRate(Number(event.target.value), "slider")}
          className="h-12 w-full accent-yellow-300"
        />
        <div className="grid grid-cols-2 gap-3">
          <Button label="Slower" onClick={() => controller.setRate(settings.rate - RATE_STEP)} />
          <Button label="Faster" onClick={() => controller.setRate(settings.rate + RATE_STEP)} />
        </div>
      </section>

      <section aria-labelledby="capture-heading" className="flex flex-col gap-3">
        <h2 id="capture-heading" className="text-2xl font-semibold">
          Camera
        </h2>
        <SwitchButton
          label="Automatic capture"
          on={settings.autoCapture}
          onToggle={() => controller.setAutoCapture(!settings.autoCapture)}
        />
        <p className="text-xl">Guidance</p>
        <div className="grid grid-cols-2 gap-3">
          <Button
            label="Full"
            aria-label="Full guidance"
            aria-pressed={settings.guidance === "full"}
            variant={settings.guidance === "full" ? "primary" : "secondary"}
            onClick={() => controller.setGuidance("full")}
          />
          <Button
            label="Minimal"
            aria-label="Minimal guidance"
            aria-pressed={settings.guidance === "minimal"}
            variant={settings.guidance === "minimal" ? "primary" : "secondary"}
            onClick={() => controller.setGuidance("minimal")}
          />
        </div>
        <p className="text-lg text-neutral-300">Minimal guidance only says “hold still” and plays the shutter.</p>
      </section>

      <section aria-labelledby="sounds-heading" className="flex flex-col gap-3">
        <h2 id="sounds-heading" className="text-2xl font-semibold">
          Sounds
        </h2>
        <SwitchButton label="Sounds" on={settings.sounds} onToggle={() => controller.setSounds(!settings.sounds)} />
      </section>

      <section aria-labelledby="passcode-heading" className="flex flex-col gap-3">
        <h2 id="passcode-heading" className="text-2xl font-semibold">
          Passcode
        </h2>
        <Button label="Forget passcode" onClick={() => controller.forgetPasscode()} />
      </section>
    </main>
  );
}

function SwitchButton({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`flex min-h-16 items-center justify-between rounded-2xl border-2 px-5 text-2xl font-bold ${
        on ? "border-yellow-300 bg-yellow-300 text-black" : "border-white bg-neutral-900 text-white"
      }`}
    >
      <span>{label}</span>
      <span aria-hidden="true">{on ? "On" : "Off"}</span>
    </button>
  );
}
