"use client";

import { useEffect, useRef, useState } from "react";
import { useController, useFocusRequest, useStore } from "../hooks";
import { BackIcon, MoreIcon, PdfIcon, PhotoIcon, SettingsIcon } from "../icons";
import { Button, MoreButton } from "../ui";

/**
 * Screen 1, the capture screen. The live picture is the content and fills the screen; the
 * controls float above it on dark glass: a short status line, More (Open a PDF, the phone's own
 * camera, Settings), and one large Capture panel across the bottom. The preview is hidden from
 * VoiceOver: there is nothing useful to describe.
 */
export function CameraScreen() {
  const controller = useController();
  const ui = useStore(controller.ui);
  const lastMessage = useStore(controller.announcer.lastMessage);
  const session = useStore(controller.session.store);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [more, setMore] = useState(false);
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
  const status = ui.cameraStatus === "starting" ? "Starting the camera…" : lastMessage;

  return (
    <main className="relative h-dvh overflow-hidden bg-black text-on-scrim">
      <video
        ref={videoRef}
        aria-hidden="true"
        tabIndex={-1}
        muted
        playsInline
        autoPlay
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="relative z-10 flex h-full flex-col">
        <div className="flex shrink-0 items-start justify-between gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          {/* The screen's name for VoiceOver; sighted users see the picture itself. */}
          <h1 ref={headingRef} tabIndex={-1} className="sr-only">
            {ui.cameraTitle}
          </h1>
          {docInProgress ? (
            <Button label="Back to reading" icon={<BackIcon />} variant="glass" size="normal" className="rounded-full" onClick={() => controller.backToReading()} />
          ) : (
            <span />
          )}
          <div className="flex flex-col items-end gap-2">
            <MoreButton
              expanded={more}
              onToggle={() => setMore((open) => !open)}
              controls="more-camera-options"
              icon={<MoreIcon />}
              variant="glass"
              className="rounded-full"
            />
            <div id="more-camera-options" hidden={!more} className="glass-dark flex w-72 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-card">
              <MenuItem label="Open a PDF" icon={<PdfIcon />} onClick={openPdfPicker} />
              {!cameraFailed && <MenuItem label="Use phone camera instead" icon={<PhotoIcon />} onClick={openPhoneCamera} />}
              <MenuItem label="Settings" icon={<SettingsIcon />} onClick={() => controller.openSettings()} />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 px-4 pt-3">
          {/* The current cue, also spoken. Clipped rather than pushing Capture off a short screen. */}
          {status && (
            <p
              className="glass-dark max-w-full min-h-0 shrink overflow-hidden rounded-3xl px-5 py-2 text-center text-2xl font-semibold leading-snug"
              data-testid="camera-status"
            >
              {status}
            </p>
          )}
          {ui.errorText && (
            <p ref={errorRef} tabIndex={-1} className="glass-dark max-w-full rounded-3xl px-5 py-2 text-center text-xl font-semibold text-highlight">
              {ui.errorText}
            </p>
          )}
        </div>

        {/* The iPhone's own camera app: works in other apps' browsers and when the live preview
            fails. And a PDF from Files, iCloud Drive, or a mail attachment saved to Files. */}
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

        {/* The one primary action: the whole bottom panel is the button. */}
        <button
          type="button"
          onClick={cameraFailed ? openPhoneCamera : () => void controller.captureManual()}
          aria-disabled={ui.capturing}
          className="glass-dark group flex h-[30dvh] min-h-36 w-full shrink-0 flex-col items-center justify-center gap-3 rounded-t-[2rem] border-2 border-b-0 border-button-border pb-[env(safe-area-inset-bottom)] text-on-scrim"
        >
          {cameraFailed ? (
            <PhotoIcon className="h-14 w-14" />
          ) : (
            <span aria-hidden="true" className={`block h-20 w-20 rounded-full border-4 border-white p-1.5 ${ui.capturing ? "opacity-50" : ""}`}>
              <span className="block h-full w-full rounded-full bg-white transition-transform duration-150 group-active:scale-90" />
            </span>
          )}
          <span className="text-3xl font-bold tracking-tight">
            {cameraFailed
              ? ui.capturing
                ? "Reading the photo…"
                : "Use phone camera instead"
              : ui.capturing
                ? "Capturing…"
                : "Capture"}
          </span>
        </button>
      </div>
    </main>
  );
}

function MenuItem({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-14 items-center gap-3 border-b border-white/15 px-4 text-left text-xl font-semibold text-on-scrim last:border-b-0 active:bg-white/10"
    >
      <span aria-hidden="true" className="h-6 w-6 shrink-0 [&>svg]:h-full [&>svg]:w-full">
        {icon}
      </span>
      {label}
    </button>
  );
}
