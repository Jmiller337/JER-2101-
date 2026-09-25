"use client";

import { useEffect, useRef } from "react";
import { useController, useFocusRequest, useStore } from "../hooks";
import { BackIcon, CameraIcon, PdfIcon, PhotoIcon, SettingsIcon } from "../icons";
import { Button } from "../ui";

const CORNERS = [
  "left-0 top-0 rounded-tl-xl border-l-4 border-t-4",
  "right-0 top-0 rounded-tr-xl border-r-4 border-t-4",
  "bottom-0 left-0 rounded-bl-xl border-b-4 border-l-4",
  "bottom-0 right-0 rounded-br-xl border-b-4 border-r-4",
];

/** A letter-sized page is 8.5 by 11 inches: the guide has the same upright shape. */
const PAGE_RATIO = 8.5 / 11;

/**
 * Screen 1. Full-screen preview (hidden from VoiceOver: there is nothing useful to describe),
 * a large status line showing the current cue, and a huge Capture button across the bottom third.
 */
export function CameraScreen() {
  const controller = useController();
  const ui = useStore(controller.ui);
  const settings = useStore(controller.settings);
  const lastMessage = useStore(controller.announcer.lastMessage);
  const session = useStore(controller.session.store);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
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
  const cameraFailed = ui.cameraStatus === "error";
  const openPhoneCamera = () => fileRef.current?.click();
  const openPdfPicker = () => pdfRef.current?.click();

  return (
    <main className="relative h-dvh overflow-hidden bg-ink text-text">
      <video
        ref={videoRef}
        aria-hidden="true"
        tabIndex={-1}
        muted
        playsInline
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />
      {/* Darkens the top and bottom so the text reads over any picture, in every theme. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-linear-to-b from-scrim/75 via-transparent to-scrim/85" />
      <div className="relative z-10 flex h-full flex-col gap-3 p-4">
        <div className="flex shrink-0 items-center justify-between gap-3">
          <h1 ref={headingRef} tabIndex={-1} className="rounded-2xl bg-scrim/85 px-4 py-1.5 text-3xl font-extrabold tracking-tight text-on-scrim">
            {ui.cameraTitle}
          </h1>
          {!cameraFailed && (
            <p className="shrink-0 rounded-full bg-scrim/85 px-3 py-1.5 text-base font-semibold text-on-scrim">
              {settings.autoCapture ? "Auto capture on" : "Press Capture"}
            </p>
          )}
        </div>
        {/* The status line may be clipped on a short screen; it is spoken anyway, and the
            Capture button must never be pushed off the bottom. */}
        <p
          className="min-h-0 shrink overflow-hidden rounded-2xl bg-scrim/85 px-4 py-3 text-2xl font-bold leading-snug text-on-scrim"
          data-testid="camera-status"
        >
          {ui.cameraStatus === "starting" ? "Starting the camera…" : lastMessage}
        </p>
        {ui.errorText && (
          <p ref={errorRef} tabIndex={-1} className="rounded-2xl bg-scrim/85 px-4 py-3 text-lg font-semibold text-highlight">
            {ui.errorText}
          </p>
        )}
        {/* A page-shaped guide, as large as fits in the space between the status and the buttons. */}
        <div aria-hidden="true" className="flex min-h-0 flex-1 items-center justify-center" style={{ containerType: "size" }}>
          {!cameraFailed && (
            <div
              className="relative drop-shadow-[0_0_3px_rgba(0,0,0,0.85)]"
              style={{ width: `min(100cqw, ${PAGE_RATIO} * 100cqh)`, aspectRatio: `${PAGE_RATIO}` }}
            >
              {CORNERS.map((corner) => (
                <span key={corner} className={`absolute h-9 w-9 border-white ${corner}`} />
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {docInProgress && (
              <Button label="Back to reading" icon={<BackIcon />} size="normal" onClick={() => controller.backToReading()} />
            )}
            <Button label="Settings" icon={<SettingsIcon />} size="normal" onClick={() => controller.openSettings()} />
            <Button label="Open a PDF" icon={<PdfIcon />} size="normal" onClick={openPdfPicker} />
            {!cameraFailed && <Button label="Use phone camera instead" icon={<PhotoIcon />} size="normal" onClick={openPhoneCamera} />}
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
          {/* A PDF from the Files app, iCloud Drive, or a mail attachment saved to Files. */}
          <input
            ref={pdfRef}
            type="file"
            accept="application/pdf,.pdf"
            tabIndex={-1}
            aria-hidden="true"
            className="hidden"
            data-testid="pdf-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void controller.openPdf(file);
            }}
          />
          {cameraFailed ? (
            <button
              type="button"
              onClick={openPhoneCamera}
              aria-disabled={ui.capturing}
              className="flex h-[33dvh] min-h-28 w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-accent bg-accent px-4 text-4xl font-extrabold tracking-tight text-on-accent active:scale-[0.99]"
            >
              <PhotoIcon className="h-12 w-12" />
              {ui.capturing ? "Reading the photo…" : "Use phone camera instead"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void controller.captureManual()}
              aria-disabled={ui.capturing}
              className="flex h-[33dvh] min-h-28 w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-accent bg-accent text-5xl font-extrabold tracking-tight text-on-accent active:scale-[0.99]"
            >
              <CameraIcon className="h-14 w-14" />
              {ui.capturing ? "Capturing…" : "Capture"}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}
