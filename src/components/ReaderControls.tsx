"use client";

import { useEffect } from "react";
import type { AppController } from "@/lib/client/controller";
import { useController, useStore } from "./hooks";
import { PauseIcon, PlayIcon, QuestionIcon, StepBackIcon, StepForwardIcon } from "./icons";
import { Button } from "./ui";

/**
 * The floating player for read-aloud mode (PROMPT.md screen 2), after Apple's audio players: a
 * line showing how far through the document the reader is, a large round Play or Pause in tinted
 * glass with Back and Forward on either side, and Ask a question below. The less-used controls
 * are in the More menu at the top. Every control is a native button with a visible label; short
 * labels get a fuller accessible name that still contains the visible text (WCAG 2.5.3).
 */
export function ReaderControls({ retake, hasDoc }: { retake?: React.ReactNode; hasDoc: boolean }) {
  const controller = useController();
  const reader = useStore(controller.reader.store);
  const active = reader.status === "playing" || reader.status === "waiting" || reader.status === "spelling";
  const progress =
    reader.status === "ended" ? 100 : reader.itemCount > 0 ? Math.min(100, Math.max(0, ((reader.index + 1) / reader.itemCount) * 100)) : 0;
  useReadingShortcuts(controller);

  return (
    <nav
      aria-label="Reading controls"
      className="scroll-edge-bottom sticky bottom-0 z-10 flex flex-col items-center gap-2 px-2 pt-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] [--edge:var(--color-ink)]"
    >
      {retake && <div className="grid w-full">{retake}</div>}
      <div className="glass w-full rounded-[2rem] px-3 pt-4 pb-2">
        {/* How far through the document: for a sighted helper; the position is spoken on Pause. */}
        <div aria-hidden="true" className="mx-4 h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-3 items-end">
          <TransportButton label="Back" name="Back one sentence" icon={<StepBackIcon className="h-9 w-9" />} onClick={() => controller.back()} />
          <TransportButton
            label={active ? "Pause" : "Play"}
            icon={active ? <PauseIcon className="h-10 w-10" /> : <PlayIcon className="ml-1 h-10 w-10" />}
            prominent
            onClick={() => controller.togglePlay()}
          />
          <TransportButton label="Forward" name="Forward one sentence" icon={<StepForwardIcon className="h-9 w-9" />} onClick={() => controller.forward()} />
        </div>
      </div>
      <Button
        label="Ask a question"
        icon={<QuestionIcon />}
        variant="float"
        size="large"
        className="px-7"
        onClick={() => controller.openAsk()}
        aria-disabled={!hasDoc}
      />
    </nav>
  );
}

/**
 * One of the player's three controls: a round slot for the icon (tinted glass for Play, empty for
 * Back and Forward, since they sit on the player's glass) with the label underneath, so all three
 * labels line up.
 */
function TransportButton({
  label,
  name,
  icon,
  prominent = false,
  onClick,
}: {
  label: string;
  name?: string;
  icon: React.ReactNode;
  prominent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={name}
      onClick={onClick}
      className="glass-item liquid-press flex touch-manipulation flex-col items-center gap-1 rounded-[1.6rem] py-1 text-xl font-bold text-text select-none"
    >
      <span
        aria-hidden="true"
        className={`flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full ${
          prominent ? "glass-prominent border-2 border-button-border" : ""
        }`}
      >
        {icon}
      </span>
      {label}
    </button>
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
