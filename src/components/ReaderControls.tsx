"use client";

import { useEffect } from "react";
import type { AppController } from "@/lib/client/controller";
import { useController, useStore } from "./hooks";
import { Button } from "./ui";

/**
 * The fixed control bar for read-aloud mode (PROMPT.md screen 2). Every control is a native
 * button with a visible label; short labels get a fuller accessible name that still contains the
 * visible text (WCAG 2.5.3).
 */
export function ReaderControls({ extra }: { extra?: React.ReactNode }) {
  const controller = useController();
  const reader = useStore(controller.reader.store);
  const settings = useStore(controller.settings);
  const active = reader.status === "playing" || reader.status === "waiting" || reader.status === "spelling";
  useReadingShortcuts(controller);

  return (
    <nav
      aria-label="Reading controls"
      className="sticky bottom-0 border-t-2 border-neutral-700 bg-neutral-950 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2">
        <Button label="Back" aria-label="Back one sentence" size="large" onClick={() => controller.back()} />
        <Button label={active ? "Pause" : "Play"} variant="primary" size="large" onClick={() => controller.togglePlay()} />
        <Button label="Forward" aria-label="Forward one sentence" size="large" onClick={() => controller.forward()} />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button label="Previous paragraph" size="normal" onClick={() => controller.previousParagraph()} />
        <Button label="Next paragraph" size="normal" onClick={() => controller.nextParagraph()} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        <Button label="Spell" aria-label="Spell the current sentence" size="normal" onClick={() => controller.spell()} />
        <Button
          label="Slower"
          aria-label={`Slower, speed ${settings.rate.toFixed(1)}`}
          size="normal"
          onClick={() => controller.slower()}
        />
        <Button
          label="Faster"
          aria-label={`Faster, speed ${settings.rate.toFixed(1)}`}
          size="normal"
          onClick={() => controller.faster()}
        />
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {extra}
        <Button label="New document" size="normal" onClick={() => controller.newDocument()} />
        <Button label="Settings" size="normal" onClick={() => controller.openSettings()} />
      </div>
    </nav>
  );
}

/**
 * Bluetooth keyboard shortcuts: Space play/pause, Left/Right one sentence, Up/Down one paragraph.
 * Keys typed into a field, and Space on a focused button (which activates that button), are left
 * alone.
 */
function useReadingShortcuts(controller: AppController): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      const onControl = tag === "BUTTON" || tag === "A";
      switch (event.key) {
        case " ":
          if (onControl) return;
          event.preventDefault();
          controller.togglePlay();
          break;
        case "ArrowLeft":
          event.preventDefault();
          controller.back();
          break;
        case "ArrowRight":
          event.preventDefault();
          controller.forward();
          break;
        case "ArrowUp":
          event.preventDefault();
          controller.previousParagraph();
          break;
        case "ArrowDown":
          event.preventDefault();
          controller.nextParagraph();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controller]);
}
