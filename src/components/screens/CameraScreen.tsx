"use client";

import { useEffect, useRef } from "react";
import { useController, useFocusRequest, useStore } from "../hooks";
import { Button } from "../ui";

/**
 * Screen 1. Full-screen preview (hidden from VoiceOver: there is nothing useful to describe),
 * a large status line showing the current cue, and a huge Capture button across the bottom third.
 */
export function CameraScreen() {
  const controller = useController();
  const ui = useStore(controller.ui);
  const lastMessage = useStore(controller.announcer.lastMessage);
  const session = useStore(controller.session.store);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useFocusRequest(headingRef, "heading");
  useFocusRequest(errorRef, "error");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    void controller.attachVideo(video);
    return () => controller.detachVideo();
  }, [controller]);

  const docInProgress = (session.doc?.pages.length ?? 0) > 0;
  const heading = ui.addingPage ? `Add page ${ui.addingPage}` : "Camera";
  const cameraFailed = ui.cameraStatus === "error";
  const openPhoneCamera = () => fileRef.current?.click();

  return (
    <main className="relative h-dvh overflow-hidden bg-black text-white">
      <video
        ref={videoRef}
        aria-hidden="true"
        tabIndex={-1}
        muted
        playsInline
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="relative z-10 flex h-full flex-col gap-3 p-4">
        <h1 ref={headingRef} tabIndex={-1} className="shrink-0 self-start rounded-xl bg-black/80 px-3 py-1 text-3xl font-bold">
          {heading}
        </h1>
        {/* The status line may be clipped on a short screen; it is spoken anyway, and the
            Capture button must never be pushed off the bottom. */}
        <p
          className="min-h-0 shrink overflow-hidden rounded-xl bg-black/80 px-3 py-2 text-2xl font-bold leading-snug"
          data-testid="camera-status"
        >
          {ui.cameraStatus === "starting" ? "Starting the camera…" : lastMessage}
        </p>
        {ui.errorText && (
          <p ref={errorRef} tabIndex={-1} className="rounded-xl bg-black/80 px-3 py-2 text-lg text-yellow-300">
            {ui.errorText}
          </p>
        )}
        <div className="mt-auto flex shrink-0 flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            {docInProgress && <Button label="Back to reading" onClick={() => controller.backToReading()} />}
            <Button label="Settings" onClick={() => controller.openSettings()} />
            {!cameraFailed && <Button label="Use phone camera instead" size="normal" onClick={openPhoneCamera} />}
          </div>
          {/* The iPhone's own camera app: works in other apps' browsers and when the live
              preview fails. Its controls are labelled for VoiceOver. */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            tabIndex={-1}
            aria-hidden="true"
            className="hidden"
            data-testid="phone-camera-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void controller.captureFromFile(file);
            }}
          />
          {cameraFailed ? (
            <button
              type="button"
              onClick={openPhoneCamera}
              aria-disabled={ui.capturing}
              className="h-[33dvh] min-h-28 w-full rounded-3xl border-4 border-yellow-300 bg-yellow-300 px-4 text-4xl font-extrabold text-black"
            >
              {ui.capturing ? "Reading the photo…" : "Use phone camera instead"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void controller.captureManual()}
              aria-disabled={ui.capturing}
              className="h-[33dvh] min-h-28 w-full rounded-3xl border-4 border-yellow-300 bg-yellow-300 text-5xl font-extrabold text-black"
            >
              {ui.capturing ? "Capturing…" : "Capture"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
