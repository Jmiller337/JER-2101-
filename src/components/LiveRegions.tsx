"use client";

import { useEffect, useRef } from "react";
import { useController } from "./hooks";

/**
 * The two live regions (PROMPT.md 6.8). Rendered once, at load, and never re-created; only their
 * text changes. Visually hidden. No aria-live="assertive" on the alert region: iOS VoiceOver
 * would announce it twice.
 */
export function LiveRegions() {
  const controller = useController();
  const statusRef = useRef<HTMLDivElement>(null);
  const alertRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    controller.live.attach(statusRef.current, alertRef.current);
    return () => controller.live.attach(null, null);
  }, [controller]);
  return (
    <>
      <div ref={statusRef} role="status" aria-atomic="true" className="sr-only" data-testid="live-status" />
      <div ref={alertRef} role="alert" aria-atomic="true" className="sr-only" data-testid="live-alert" />
    </>
  );
}
