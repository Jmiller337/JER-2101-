"use client";

import { useSyncExternalStore } from "react";
import { AppController } from "@/lib/client/controller";
import { AppShell } from "./AppShell";
import { ControllerContext } from "./hooks";
import { StartButtonMarkup } from "./screens/StartScreen";

let controller: AppController | null = null;

/** One controller per page load, created in the browser only (it touches speech and the camera). */
function getController(): AppController {
  if (!controller) {
    controller = new AppController();
    controller.install();
  }
  return controller;
}

const noSubscription = () => () => undefined;

/**
 * The server renders the Start screen markup; after hydration the live app takes over with the
 * same markup, so there is no visible change.
 */
export function ClientApp() {
  const instance = useSyncExternalStore(noSubscription, getController, () => null);
  if (!instance) return <StartButtonMarkup onStart={undefined} />;
  return (
    <ControllerContext.Provider value={instance}>
      <AppShell />
    </ControllerContext.Provider>
  );
}
