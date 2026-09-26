"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { CAMERA_MODE_NAMES, CAMERA_MODES, SwipeTracker, type CameraMode } from "@/lib/client/cameraModes";
import { useController, useFocusRequest, useStore } from "../hooks";
import { BackIcon, MoreIcon, PdfIcon, PhotoIcon, SettingsIcon } from "../icons";
import { PageOutline } from "../PageOutline";
import { Button, MoreButton } from "../ui";

/**
 * Screen 1, the home screen, built like the iPhone's Camera: the picture fills the whole screen,
 * and three modes sit in a glass capsule above one large action area: PDF, Camera, and Photos.
 * Swipe left or right anywhere on the screen, or tap a mode, to move between them; the app says
 * each mode's name. In Camera mode a box is drawn around a page with writing on it; the preview
 * is hidden from VoiceOver, since every change is spoken. VoiceOver takes sideways swipes for
 * itself, so its users switch modes with the tabs.
 */
export function CameraScreen() {
  const controller = useController();
  const ui = useStore(controller.ui);
  const lastMessage = useStore(controller.announcer.lastMessage);
  const session = useStore(controller.session.store);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const lensRef = useRef<HTMLSpanElement>(null);
  const [more, setMore] = useState(false);
  const [swipe] = useState(() => new SwipeTracker());
  /** When the last swipe ended: the click that follows a swipe with a mouse is not a tap. */
  const lastSwipeAt = useRef(-Infinity);
  useFocusRequest(headingRef, "heading");
  useFocusRequest(errorRef, "error");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    void controller.attachVideo(video);
    return () => controller.detachVideo();
  }, [controller]);

  const mode = ui.cameraMode;

  // The lens of lighter glass slides under the selected mode.
  useEffect(() => {
    const place = () => {
      const tab = document.getElementById(`mode-${mode}`);
      const lens = lensRef.current;
      if (!tab || !lens) return;
      lens.style.width = `${tab.offsetWidth}px`;
      lens.style.transform = `translateX(${tab.offsetLeft}px)`;
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [mode]);
  const docInProgress = (session.doc?.pages.length ?? 0) > 0;
  const cameraFailed = ui.cameraStatus === "error";
  const openPhoneCamera = () => fileRef.current?.click();
  const openPhotoPicker = () => photoRef.current?.click();
  const openPdfPicker = () => pdfRef.current?.click();
  const status = ui.cameraStatus === "starting" ? "Starting the camera…" : lastMessage;

  const chooseMode = (next: CameraMode) => {
    controller.setCameraMode(next);
    document.getElementById(`mode-${next}`)?.focus();
  };
  // Arrow keys move between the tabs, as in any tab list.
  const onTabKey = (event: KeyboardEvent) => {
    const index = CAMERA_MODES.indexOf(mode);
    const next =
      event.key === "ArrowRight" ? CAMERA_MODES[index + 1] : event.key === "ArrowLeft" ? CAMERA_MODES[index - 1] : undefined;
    if (!next) return;
    event.preventDefault();
    chooseMode(next);
  };

  const action = actionFor(mode, cameraFailed, ui.capturing);
  const onAction = mode === "pdf" ? openPdfPicker : mode === "photos" ? openPhotoPicker : cameraFailed ? openPhoneCamera : () => void controller.captureManual();

  return (
    <main
      className="relative h-dvh touch-pan-y touch-pinch-zoom overflow-hidden bg-black text-on-scrim select-none"
      onPointerDown={(event) => {
        if (event.isPrimary) swipe.down(event.clientX, event.clientY, event.timeStamp, event.pointerId);
      }}
      onPointerUp={(event) => {
        const direction = swipe.up(event.clientX, event.clientY, event.timeStamp, event.pointerId);
        if (!direction) return;
        lastSwipeAt.current = event.timeStamp;
        controller.swipeCameraMode(direction);
      }}
      onPointerCancel={() => swipe.cancel()}
      onClickCapture={(event) => {
        if (event.timeStamp - lastSwipeAt.current < 500) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {/* The picture fills the whole screen, as in the iPhone's Camera, with the box around the
          page drawn on it and the controls floating over it. */}
      <video
        ref={videoRef}
        aria-hidden="true"
        tabIndex={-1}
        muted
        playsInline
        autoPlay
        className={`absolute inset-0 h-full w-full object-cover ${mode === "camera" ? "" : "invisible"}`}
      />
      <PageOutline videoRef={videoRef} />
      {mode !== "camera" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 pb-[34dvh] text-center" data-testid="mode-intro">
          {mode === "pdf" ? <PdfIcon className="h-24 w-24" /> : <PhotoIcon className="h-24 w-24" />}
          <p className="max-w-xs text-2xl font-semibold leading-snug">
            {mode === "pdf" ? "Read a PDF from Files, Mail, or iCloud Drive." : "Read a photo or a screenshot from your library."}
          </p>
        </div>
      )}

      <div className="relative z-10 flex h-full flex-col">
        <div className="flex shrink-0 items-start justify-between gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
          {/* The screen's name for VoiceOver; sighted users see the picture itself. */}
          <h1 ref={headingRef} tabIndex={-1} className="sr-only">
            {ui.cameraTitle}
          </h1>
          {docInProgress ? (
            <Button label="Back to reading" icon={<BackIcon />} variant="glass" size="normal" onClick={() => controller.backToReading()} />
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
            />
            <div id="more-camera-options" hidden={!more} className="glass-dark flex w-72 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-card">
              {!cameraFailed && <MenuItem label="Use phone camera instead" icon={<PhotoIcon />} onClick={openPhoneCamera} />}
              <MenuItem label="Settings" icon={<SettingsIcon />} onClick={() => controller.openSettings()} />
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center gap-2 px-4 pt-3">
          {/* The current cue, also spoken. Clipped rather than pushing Capture off a short screen. */}
          {mode === "camera" && status && (
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

        <div className="flex shrink-0 flex-col items-center pb-[env(safe-area-inset-bottom)]">
          {/* The modes, like Photo, Video, and Slo-mo on the iPhone's Camera, in a glass capsule. */}
          <div role="tablist" aria-label="Modes" className="glass-dark flex gap-1 rounded-full p-1" onKeyDown={onTabKey}>
            <span ref={lensRef} aria-hidden="true" className="glass-lens pointer-events-none absolute top-1 bottom-1 left-0 w-0 rounded-full" />
            {CAMERA_MODES.map((m) => (
              <button
                key={m}
                id={`mode-${m}`}
                type="button"
                role="tab"
                aria-selected={m === mode}
                aria-controls="camera-mode-panel"
                tabIndex={m === mode ? 0 : -1}
                onClick={() => chooseMode(m)}
                className={`relative min-h-12 min-w-24 rounded-full px-4 text-xl font-bold tracking-wide uppercase ${
                  m === mode ? "text-mode-selected" : "text-mode-idle"
                }`}
              >
                {CAMERA_MODE_NAMES[m]}
              </button>
            ))}
          </div>

          {/* The one primary action: a large clear area over the bottom of the picture, easy to
              find by touch, with the shutter and its label on glass. */}
          <div role="tabpanel" id="camera-mode-panel" aria-labelledby={`mode-${mode}`} className="w-full p-2">
            <button
              type="button"
              onClick={onAction}
              aria-disabled={ui.capturing}
              className="group flex h-[24dvh] min-h-28 w-full flex-col items-center justify-center gap-3 rounded-[2rem] border-2 border-button-border text-on-scrim"
            >
              {action.icon}
              <span className="glass-dark rounded-full px-6 py-1.5 text-3xl font-bold tracking-tight">{action.label}</span>
            </button>
          </div>
        </div>
      </div>

      {/* The iPhone's own camera app: works in other apps' browsers and when the live preview
          fails. A photo or screenshot from the library. And a PDF from Files, iCloud Drive, or a
          mail attachment saved to Files. */}
      <FileInput inputRef={fileRef} accept="image/*" capture testId="phone-camera-input" onFile={(file) => void controller.captureFromFile(file)} />
      <FileInput inputRef={photoRef} accept="image/*" testId="photo-input" onFile={(file) => void controller.captureFromFile(file)} />
      <FileInput inputRef={pdfRef} accept="application/pdf,.pdf" testId="pdf-input" onFile={(file) => void controller.openPdf(file)} />
    </main>
  );
}

/** The large button's icon and label for each mode. */
function actionFor(mode: CameraMode, cameraFailed: boolean, capturing: boolean): { icon: ReactNode; label: string } {
  if (mode === "pdf") return { icon: <PdfIcon className="h-14 w-14" />, label: capturing ? "Opening the PDF…" : "Choose a PDF" };
  if (mode === "photos") return { icon: <PhotoIcon className="h-14 w-14" />, label: capturing ? "Reading the photo…" : "Choose a photo" };
  if (cameraFailed) return { icon: <PhotoIcon className="h-14 w-14" />, label: capturing ? "Reading the photo…" : "Use phone camera instead" };
  return {
    icon: (
      <span
        aria-hidden="true"
        className={`block h-20 w-20 rounded-full border-4 border-white p-1.5 shadow-[0_0_0_2px_rgb(0_0_0/0.35),0_4px_16px_rgb(0_0_0/0.35)] ${capturing ? "opacity-50" : ""}`}
      >
        <span className="block h-full w-full rounded-full bg-white transition-transform duration-150 group-active:scale-90" />
      </span>
    ),
    label: capturing ? "Capturing…" : "Capture",
  };
}

function FileInput({
  inputRef,
  accept,
  capture,
  testId,
  onFile,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
  capture?: boolean;
  testId: string;
  onFile: (file: File) => void;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept={accept}
      capture={capture ? "environment" : undefined}
      tabIndex={-1}
      aria-hidden="true"
      className="hidden"
      data-testid={testId}
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) onFile(file);
      }}
    />
  );
}

function MenuItem({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
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
