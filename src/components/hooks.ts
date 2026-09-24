"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import type { AppController, FocusTarget } from "@/lib/client/controller";
import type { Store } from "@/lib/client/store";

export const ControllerContext = createContext<AppController | null>(null);

export function useController(): AppController {
  const controller = useContext(ControllerContext);
  if (!controller) throw new Error("useController must be used inside the app shell");
  return controller;
}

export function useStore<T>(store: Store<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/**
 * Moves focus to `ref` when the controller asks for `target` (on entering a screen, after a
 * capture, after an error). Focus is moved on the next frame so the element exists and
 * VoiceOver picks up the change.
 */
export function useFocusRequest(ref: RefObject<HTMLElement | null>, target: FocusTarget): void {
  const controller = useController();
  const { focus } = useStore(controller.ui);
  const lastSeq = useRef(-1);
  useEffect(() => {
    if (focus.target !== target || focus.seq === lastSeq.current) return;
    lastSeq.current = focus.seq;
    const frame = requestAnimationFrame(() => ref.current?.focus({ preventScroll: false }));
    return () => cancelAnimationFrame(frame);
  }, [focus, target, ref]);
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (listener) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", listener);
      return () => query.removeEventListener("change", listener);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
