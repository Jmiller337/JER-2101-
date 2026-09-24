export type CameraErrorKind = "denied" | "in_app_browser" | "insecure" | "no_camera" | "busy" | "unknown";

export class CameraError extends Error {
  constructor(readonly kind: CameraErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "CameraError";
  }
}

/**
 * Browsers embedded in other apps (Facebook, Instagram, Gmail, and most WKWebView-based
 * in-app browsers) usually cannot use the camera. Safari, Chrome, and Firefox for iOS include
 * a "Safari" token in their user agent; embedded web views usually do not.
 */
export function isInAppBrowser(userAgent: string, standalone = false): boolean {
  if (standalone) return false;
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|LinkedInApp|Snapchat|Pinterest|MicroMessenger|GSA\/|Twitter|WhatsApp/i.test(userAgent)) {
    return true;
  }
  return /(iPhone|iPad|iPod)/.test(userAgent) && /AppleWebKit/.test(userAgent) && !/Safari\//.test(userAgent);
}

export interface CameraSettingsInfo {
  width: number;
  height: number;
  facingMode?: string;
  torch: boolean;
}

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

type ImageCaptureCtor = new (track: MediaStreamTrack) => { takePhoto(): Promise<Blob> };

/** A running camera: the stream, its video track, and the preview element it plays in. */
export class CameraHandle {
  private torchOn = false;

  constructor(
    readonly stream: MediaStream,
    readonly track: MediaStreamTrack,
    readonly video: HTMLVideoElement,
  ) {}

  info(): CameraSettingsInfo {
    const settings = this.track.getSettings();
    return {
      width: settings.width ?? this.video.videoWidth,
      height: settings.height ?? this.video.videoHeight,
      facingMode: settings.facingMode,
      torch: this.hasTorch(),
    };
  }

  hasTorch(): boolean {
    try {
      const caps = this.track.getCapabilities?.() as TorchCapabilities | undefined;
      return caps?.torch === true;
    } catch {
      return false;
    }
  }

  /** Turns the torch on or off when the phone supports it. Returns whether it worked. */
  async setTorch(on: boolean): Promise<boolean> {
    if (!this.hasTorch() || this.torchOn === on) return this.torchOn === on;
    try {
      await this.track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      this.torchOn = on;
      return true;
    } catch {
      return false;
    }
  }

  get torchIsOn(): boolean {
    return this.torchOn;
  }

  /**
   * A full-quality still. `ImageCapture.takePhoto()` (Safari 18.4+, Chrome) returns a
   * full-sensor photo, sharper than a video frame; if it is missing, slow, or fails, the current
   * video frame is used instead.
   */
  async captureStill(): Promise<{ source: CanvasImageSource; width: number; height: number; method: string }> {
    const Ctor = (window as unknown as { ImageCapture?: ImageCaptureCtor }).ImageCapture;
    if (Ctor && this.track.readyState === "live") {
      try {
        const blob = await withTimeout(new Ctor(this.track).takePhoto(), 4000);
        const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
        if (bitmap.width > 0 && bitmap.height > 0) {
          return { source: bitmap, width: bitmap.width, height: bitmap.height, method: "takePhoto" };
        }
      } catch {
        // fall back to a video frame
      }
    }
    const frame = this.grabFrame();
    return { source: frame, width: frame.width, height: frame.height, method: "videoFrame" };
  }

  /** The current preview frame at the track's native resolution. */
  grabFrame(): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = this.video.videoWidth;
    canvas.height = this.video.videoHeight;
    canvas.getContext("2d")?.drawImage(this.video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  stop(): void {
    for (const track of this.stream.getTracks()) track.stop();
    this.video.srcObject = null;
  }
}

/** Starts the rear camera in the given video element (PROMPT.md 6.1). */
export async function startCamera(video: HTMLVideoElement): Promise<CameraHandle> {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const inApp = isInAppBrowser(navigator.userAgent, standalone);
  if (!window.isSecureContext) throw new CameraError("insecure");
  const devices = navigator.mediaDevices;
  if (!devices?.getUserMedia) throw new CameraError(inApp ? "in_app_browser" : "unknown");

  let stream: MediaStream;
  try {
    stream = await devices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
  } catch (err) {
    const name = (err as { name?: string } | null)?.name ?? "";
    if (name === "NotAllowedError" || name === "SecurityError") throw new CameraError(inApp ? "in_app_browser" : "denied");
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new CameraError("no_camera");
    if (name === "NotReadableError" || name === "AbortError") throw new CameraError("busy");
    throw new CameraError("unknown", String(err));
  }

  const track = stream.getVideoTracks()[0];
  if (!track) {
    for (const t of stream.getTracks()) t.stop();
    throw new CameraError("no_camera");
  }
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    // Autoplay can reject even though frames arrive; readiness is checked below.
  }
  await waitForFrames(video, 5000);
  return new CameraHandle(stream, track, video);
}

function waitForFrames(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  if (video.videoWidth > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", check);
      video.removeEventListener("playing", check);
      resolve();
    };
    const check = () => {
      if (video.videoWidth > 0) done();
    };
    const timer = setTimeout(done, timeoutMs);
    video.addEventListener("loadedmetadata", check);
    video.addEventListener("playing", check);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
