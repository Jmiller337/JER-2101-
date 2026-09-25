"use client";

import { useEffect } from "react";
import { useController, useStore } from "./hooks";
import { LiveRegions } from "./LiveRegions";
import { AskScreen } from "./screens/AskScreen";
import { CameraScreen } from "./screens/CameraScreen";
import { ModeScreen } from "./screens/ModeScreen";
import { PasscodeScreen } from "./screens/PasscodeScreen";
import { ReadingScreen } from "./screens/ReadingScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { StartScreen } from "./screens/StartScreen";

export function AppShell() {
  const controller = useController();
  const { screen, speechUnavailable } = useStore(controller.ui);
  const { theme } = useStore(controller.settings);
  useEffect(() => applyTheme(theme), [theme]);
  return (
    <>
      <LiveRegions />
      {speechUnavailable && (
        <p className="bg-accent px-4 py-3 text-xl font-bold text-on-accent" data-testid="speech-banner">
          This browser cannot speak. Open the app in Safari, or turn on VoiceOver to hear it.
        </p>
      )}
      {screen === "start" && <StartScreen />}
      {screen === "mode" && <ModeScreen />}
      {screen === "passcode" && <PasscodeScreen />}
      {screen === "camera" && <CameraScreen />}
      {screen === "reading" && <ReadingScreen />}
      {screen === "ask" && <AskScreen />}
      {screen === "settings" && <SettingsScreen />}
    </>
  );
}

/** Page background of each theme, for the browser's toolbar tint. Matches globals.css. */
const THEME_BACKGROUNDS: Record<string, string> = { light: "#ffffff", dark: "#000000", contrast: "#000000" };

function applyTheme(theme: string): void {
  const root = document.documentElement;
  const metas = document.querySelectorAll('meta[name="theme-color"]');
  if (theme === "auto") {
    // Automatic: the CSS follows the iPhone's setting, and each toolbar tint keeps its media query.
    root.removeAttribute("data-theme");
    metas.forEach((meta) =>
      meta.setAttribute("content", meta.getAttribute("media")?.includes("dark") ? THEME_BACKGROUNDS.dark! : THEME_BACKGROUNDS.light!),
    );
    return;
  }
  root.setAttribute("data-theme", theme);
  metas.forEach((meta) => meta.setAttribute("content", THEME_BACKGROUNDS[theme] ?? THEME_BACKGROUNDS.light!));
}
