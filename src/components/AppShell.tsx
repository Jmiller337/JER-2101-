"use client";

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
