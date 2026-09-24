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
  const { screen } = useStore(controller.ui);
  return (
    <>
      <LiveRegions />
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
