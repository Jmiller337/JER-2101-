"use client";

import { useEffect, useState, type MouseEvent, type PointerEvent } from "react";
import { HoldGesture } from "@/lib/client/voice/hold";
import { useController, useStore } from "./hooks";

export interface HoldHandlers {
  onPointerDown(event: PointerEvent): void;
  onPointerMove(event: PointerEvent): void;
  /** Returns true when the touch was a hold (so it is not also a tap or a swipe). */
  onPointerUp(event: PointerEvent): boolean;
  onPointerCancel(): void;
  onClickCapture(event: MouseEvent): void;
  onContextMenu(event: MouseEvent): void;
}

/** Holds that start in a text field or on a slider are left to the field: typing, dragging. */
function isFormField(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input, textarea, select, [contenteditable]") !== null;
}

/**
 * Hold anywhere on the screen to talk (docs/PROMPT-2.md section 4), for read-aloud mode. Spread
 * the handlers on the screen's outermost element, with `HOLD_CLASSES` so a long press selects no
 * text and opens no callout. Returns null in VoiceOver mode, where VoiceOver takes the touches.
 */
export function useHoldToTalk(): HoldHandlers | null {
  const controller = useController();
  const { mode } = useStore(controller.settings);
  const [gesture] = useState(
    () =>
      new HoldGesture(
        { setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (handle) => window.clearTimeout(handle as number) },
        { onStart: () => controller.startTalk(), onEnd: () => controller.endTalk(), onCancel: () => controller.cancelTalk() },
      ),
  );

  useEffect(() => {
    // Once listening, a finger that drifts must not start a scroll: the browser would take the
    // touch and end the hold. (React's touch listeners are passive, so this one is added here.)
    const onTouchMove = (event: TouchEvent) => {
      if (gesture.holding) event.preventDefault();
    };
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      gesture.cancel();
    };
  }, [gesture]);

  if (mode !== "readAloud") return null;
  return {
    onPointerDown: (event) => {
      if (!event.isPrimary) gesture.cancel();
      else if (!isFormField(event.target)) gesture.down(event.clientX, event.clientY, event.pointerId);
    },
    onPointerMove: (event) => gesture.move(event.clientX, event.clientY, event.pointerId),
    onPointerUp: (event) => gesture.up(event.pointerId, event.timeStamp),
    onPointerCancel: () => gesture.cancel(),
    onClickCapture: (event) => {
      if (gesture.swallowClick(event.timeStamp)) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onContextMenu: (event) => {
      if (!isFormField(event.target)) event.preventDefault();
    },
  };
}

/** No text selection and no callout on a long press (iOS), where holding means talking. */
export const HOLD_CLASSES = "select-none [-webkit-touch-callout:none]";

/** The handlers for a screen with nothing else to do with the pointer. */
export function holdProps(hold: HoldHandlers | null) {
  if (!hold) return {};
  return {
    onPointerDown: hold.onPointerDown,
    onPointerMove: hold.onPointerMove,
    onPointerUp: (event: PointerEvent) => void hold.onPointerUp(event),
    onPointerCancel: hold.onPointerCancel,
    onClickCapture: hold.onClickCapture,
    onContextMenu: hold.onContextMenu,
  };
}
