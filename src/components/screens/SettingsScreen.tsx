"use client";

import { useRef, type ReactNode } from "react";
import { RATE_MAX, RATE_MIN, RATE_STEP, THEME_NAMES, type Theme } from "@/lib/client/settings";
import { betterVoiceAvailable } from "@/lib/client/speech/voices";
import { useController, useFocusRequest, useStore } from "../hooks";
import { CheckIcon, FasterIcon, SlowerIcon, SpeakerIcon } from "../icons";
import { Button, NavBar } from "../ui";

/**
 * Settings, as an iOS grouped list: the most used sections first, one choice per row, a
 * checkmark on the selected row, and Done in the navigation bar. Every change is announced
 * through the single announcement channel; all values persist in localStorage.
 */
export function SettingsScreen() {
  const controller = useController();
  const settings = useStore(controller.settings);
  const allVoices = useStore(controller.voices);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useFocusRequest(headingRef, "heading");
  const voices = controller.voiceChoices();
  const current = controller.currentVoice();
  const readAloud = settings.mode !== "voiceOver";
  const betterVoice = betterVoiceAvailable(allVoices, controller.voiceLanguage());

  return (
    <main className="min-h-dvh bg-grouped text-text">
      <NavBar title="Settings" headingRef={headingRef} onDone={() => controller.closeSettings()} />
      <div className="flex flex-col gap-8 px-4 pt-4 pb-12">
        <Group id="speed" title="Speed">
          <div className="flex flex-col gap-3 p-4">
            <label htmlFor="speed" className="flex items-baseline justify-between gap-3 text-xl">
              <span>Reading speed</span>
              <span className="font-bold">{settings.rate.toFixed(1)}</span>
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
              <Button label="Slower" icon={<SlowerIcon />} size="normal" onClick={() => controller.setRate(settings.rate - RATE_STEP)} />
              <Button label="Faster" icon={<FasterIcon />} size="normal" onClick={() => controller.setRate(settings.rate + RATE_STEP)} />
            </div>
          </div>
        </Group>

        <Group
          id="voice"
          title="Voice"
          footer={
            betterVoice
              ? "This iPhone is using its basic voice. For a nicer one, open the iPhone's Settings, then Accessibility, Spoken Content, Voices, English, and download Ava or Zoe marked Enhanced or Premium. The app will use it automatically."
              : "More voices: on the iPhone open Settings, Accessibility, Spoken Content, Voices, and download an Enhanced or Premium voice."
          }
        >
          <div className="flex flex-col gap-2 p-4">
            <label htmlFor="voice" className="text-xl">
              Voice for {controller.voiceLanguage()}
            </label>
            <select
              id="voice"
              value={settings.voiceURI && voices.some((v) => v.voiceURI === settings.voiceURI) ? settings.voiceURI : ""}
              onChange={(event) => controller.setVoice(event.target.value || null)}
              className="min-h-14 rounded-xl border-2 border-line-2 bg-surface px-3 text-xl text-text"
            >
              <option value="">Automatic{current ? ` (${current.name})` : ""}</option>
              {voices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </div>
          <RowButton label="Preview voice" icon={<SpeakerIcon />} accent onClick={() => controller.previewVoice()} />
        </Group>

        <Group id="colours" title="Colours" footer="Automatic follows the iPhone's light or dark setting.">
          {(Object.keys(THEME_NAMES) as Theme[]).map((theme) => (
            <CheckRow key={theme} label={THEME_NAMES[theme]} selected={settings.theme === theme} onSelect={() => controller.setTheme(theme)} />
          ))}
        </Group>

        <Group id="capture" title="Camera" footer="Minimal guidance only says “hold still” and plays the shutter.">
          <SwitchRow
            label="Automatic capture"
            on={settings.autoCapture}
            onToggle={() => controller.setAutoCapture(!settings.autoCapture)}
          />
          <CheckRow label="Full guidance" selected={settings.guidance === "full"} onSelect={() => controller.setGuidance("full")} />
          <CheckRow label="Minimal guidance" selected={settings.guidance === "minimal"} onSelect={() => controller.setGuidance("minimal")} />
        </Group>

        <Group id="sounds" title="Sounds">
          <SwitchRow label="Sounds" on={settings.sounds} onToggle={() => controller.setSounds(!settings.sounds)} />
        </Group>

        <Group
          id="mode"
          title="How the app talks to you"
          footer="Choose VoiceOver if you use a screen reader: the app stays quiet and VoiceOver reads everything."
        >
          <CheckRow label="Read aloud (app voice)" selected={readAloud} onSelect={() => controller.setMode("readAloud")} />
          <CheckRow label="VoiceOver (I use a screen reader)" selected={!readAloud} onSelect={() => controller.setMode("voiceOver")} />
        </Group>
      </div>
    </main>
  );
}

/** A titled group of rows on a rounded card, with an optional explanation underneath. */
function Group({ id, title, footer, children }: { id: string; title: string; footer?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-2">
      <h2 id={`${id}-heading`} className="px-4 text-lg font-semibold text-muted">
        {title}
      </h2>
      <div className="divide-y divide-line overflow-hidden rounded-card bg-surface">{children}</div>
      {footer && <p className="px-4 text-base text-muted">{footer}</p>}
    </section>
  );
}

/** One choice in a list. The selected row shows a checkmark and is announced as selected. */
function CheckRow({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className="flex min-h-16 w-full items-center justify-between gap-4 px-4 text-left text-xl font-medium active:bg-surface-2"
    >
      <span>{label}</span>
      {selected && <CheckIcon className="h-7 w-7 shrink-0 text-accent" />}
    </button>
  );
}

/** An action in a list, like Preview voice. */
function RowButton({ label, icon, onClick, accent }: { label: string; icon: ReactNode; onClick: () => void; accent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-16 w-full items-center gap-3 px-4 text-left text-xl font-semibold active:bg-surface-2 ${accent ? "text-accent" : ""}`}
    >
      <span aria-hidden="true" className="h-7 w-7 shrink-0 [&>svg]:h-full [&>svg]:w-full">
        {icon}
      </span>
      {label}
    </button>
  );
}

/** An iOS-style switch row: the label on the left, the switch on the right. */
function SwitchRow({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="flex min-h-16 w-full items-center justify-between gap-4 px-4 text-left text-xl font-medium active:bg-surface-2"
    >
      <span>{label}</span>
      <span aria-hidden="true" className="flex shrink-0 items-center gap-3">
        <span className="text-lg text-muted">{on ? "On" : "Off"}</span>
        <span
          className={`relative h-9 w-16 rounded-full border-2 border-button-border transition-colors duration-200 ${on ? "bg-accent" : "bg-surface-3"}`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-7 w-7 rounded-full shadow-sm transition-transform duration-200 ${on ? "translate-x-7 bg-on-accent" : "bg-white"}`}
          />
        </span>
      </span>
    </button>
  );
}
