"use client";

import { useRef, type ReactNode } from "react";
import { RATE_MAX, RATE_MIN, RATE_STEP, THEME_NAMES, type Theme } from "@/lib/client/settings";
import { betterVoiceAvailable } from "@/lib/client/speech/voices";
import { useController, useFocusRequest, useStore } from "../hooks";
import { BackIcon, FasterIcon, SlowerIcon, SpeakerIcon } from "../icons";
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
  const allVoices = useStore(controller.voices);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusRequest(headingRef, "heading");
  const voices = controller.voiceChoices();
  const current = controller.currentVoice();
  const readAloud = settings.mode !== "voiceOver";
  const betterVoice = betterVoiceAvailable(allVoices, controller.voiceLanguage());

  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-ink p-5 pb-12 text-text">
      <div className="flex flex-col gap-4">
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-extrabold tracking-tight">
          Settings
        </h1>
        <Button
          label={`Back to ${RETURN_NAMES[ui.returnTo] ?? "start"}`}
          icon={<BackIcon />}
          variant="primary"
          size="large"
          onClick={() => controller.closeSettings()}
        />
      </div>

      <Section id="mode" title="How the app talks to you">
        <p className="text-xl text-muted">
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
      </Section>

      <Section id="colours" title="Colours">
        <div className="grid grid-cols-1 gap-3">
          {(Object.keys(THEME_NAMES) as Theme[]).map((theme) => (
            <Button
              key={theme}
              label={THEME_NAMES[theme]}
              aria-pressed={settings.theme === theme}
              icon={<Swatch theme={theme} />}
              variant={settings.theme === theme ? "primary" : "secondary"}
              className="justify-start"
              onClick={() => controller.setTheme(theme)}
            />
          ))}
        </div>
      </Section>

      <Section id="voice" title="Voice">
        {betterVoice && (
          <div className="rounded-2xl border-2 border-accent/60 bg-accent-soft p-4 text-lg">
            <p className="text-xl font-bold text-accent">A nicer voice is available</p>
            <p className="mt-1">
              This iPhone is using its basic voice. Open the iPhone&rsquo;s Settings, then Accessibility, Spoken Content, Voices,
              English, and download a voice marked Enhanced or Premium, such as Ava or Zoe. The app will use it automatically.
            </p>
          </div>
        )}
        <label htmlFor="voice" className="text-xl">
          Voice for {controller.voiceLanguage()}
        </label>
        <select
          id="voice"
          value={settings.voiceURI && voices.some((v) => v.voiceURI === settings.voiceURI) ? settings.voiceURI : ""}
          onChange={(event) => controller.setVoice(event.target.value || null)}
          className="min-h-16 rounded-2xl border-2 border-line-2 bg-ink px-3 text-2xl text-text"
        >
          <option value="">Automatic{current ? ` (${current.name})` : ""}</option>
          {voices.map((voice) => (
            <option key={voice.voiceURI} value={voice.voiceURI}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>
        <Button label="Preview voice" icon={<SpeakerIcon />} onClick={() => controller.previewVoice()} />
        {!betterVoice && (
          <p className="text-lg text-muted">
            More voices: on the iPhone open Settings, Accessibility, Spoken Content, Voices, and download an Enhanced or
            Premium voice.
          </p>
        )}
      </Section>

      <Section id="speed" title="Speed">
        <label htmlFor="speed" className="text-xl">
          Reading speed: <span className="font-bold text-accent">{settings.rate.toFixed(1)}</span>
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
          className="h-12 w-full"
        />
        <div className="grid grid-cols-2 gap-3">
          <Button label="Slower" icon={<SlowerIcon />} onClick={() => controller.setRate(settings.rate - RATE_STEP)} />
          <Button label="Faster" icon={<FasterIcon />} onClick={() => controller.setRate(settings.rate + RATE_STEP)} />
        </div>
      </Section>

      <Section id="capture" title="Camera">
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
        <p className="text-lg text-muted">Minimal guidance only says “hold still” and plays the shutter.</p>
      </Section>

      <Section id="sounds" title="Sounds">
        <SwitchButton label="Sounds" on={settings.sounds} onToggle={() => controller.setSounds(!settings.sounds)} />
      </Section>

      <Section id="passcode" title="Passcode">
        <Button label="Forget passcode" onClick={() => controller.forgetPasscode()} />
      </Section>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <h2 id={`${id}-heading`} className="text-2xl font-bold tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SwitchButton({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`flex min-h-16 items-center justify-between gap-4 rounded-2xl border-2 px-5 text-2xl font-bold ${
        on ? "border-accent bg-surface-3 text-text" : "border-line-2 bg-surface-2 text-text"
      }`}
    >
      <span>{label}</span>
      <span aria-hidden="true" className="flex shrink-0 items-center gap-3">
        <span className="text-lg font-semibold text-muted">{on ? "On" : "Off"}</span>
        <span className={`relative h-9 w-16 rounded-full border-2 transition-colors ${on ? "border-accent bg-accent" : "border-line-2 bg-ink"}`}>
          <span
            className={`absolute top-1 left-1 h-6 w-6 rounded-full transition-transform ${on ? "translate-x-7 bg-on-accent" : "bg-text"}`}
          />
        </span>
      </span>
    </button>
  );
}

/** A small preview of a theme: its page colour with its button colour on top. */
const SWATCHES: Record<Theme, { page: string; button: string }> = {
  light: { page: "#f4f4f0", button: "#1d3d9e" },
  dark: { page: "#000000", button: "#9cc1ff" },
  contrast: { page: "#000000", button: "#ffe600" },
};

function Swatch({ theme }: { theme: Theme }) {
  const { page, button } = SWATCHES[theme];
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill={page} stroke="#8a8a80" strokeWidth="1.5" />
      <rect x="6" y="9" width="12" height="6" rx="2" fill={button} />
    </svg>
  );
}
