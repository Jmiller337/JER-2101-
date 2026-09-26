import { CAMERA_MESSAGES, spokenError } from "@/lib/shared/messages";
import { ASK_LIMITS, MAX_PDF_BYTES, type ChatTurn, type ErrorCode, type MetaEvent } from "@/lib/shared/protocol";
import { Announcer, type AnnounceOptions, type Channel } from "./announce/announcer";
import { LiveRegions } from "./announce/liveRegions";
import { ApiError, createApiClient, type ApiClient } from "./api";
import { Sounds } from "./audio/sounds";
import { CameraError, startCamera, type CameraErrorKind, type CameraHandle } from "./camera/camera";
import { FrameSampler } from "./camera/frameSampler";
import { laplacianVariance, toLuma, type Luma } from "./vision/analysis";
import { blobToBase64, imageFromFile, prepareImage, type PreparedImage } from "./camera/prepare";
import { docToAskPages, type Doc, type DocPage } from "./document/model";
import { DocumentSession, type PageReadCallbacks, type PreparedPdf } from "./document/session";
import {
  clampRate,
  forgetPasscode,
  loadPasscode,
  loadSettings,
  RATE_STEP,
  savePasscode,
  saveSettings,
  type Mode,
  type Settings,
  THEME_NAMES,
  type Theme,
} from "./settings";
import { BrowserSpeechPort, type SpeechPort, type VoiceInfo } from "./speech/port";
import { Listener, recognitionAvailable } from "./speech/recognition";
import { StreamingSpeech } from "./speech/streamingSpeech";
import { Reader } from "./speech/reader";
import { Speaker, type Timers } from "./speech/speaker";
import { pickVoice, voicesForLanguage } from "./speech/voices";
import { safeStorage, type StorageLike } from "./storage";
import { Store } from "./store";
import { FRAMING, CuePolicy, FramingTracker, type Situation } from "./vision/framing";
import { CAMERA_MODE_LINES, MODES_HINT, modeAfterSwipe, type CameraMode, type SwipeDirection } from "./cameraModes";
import { NO_OUTLINE, normalizeQuad, type PageOutline } from "./vision/outline";
import { WakeLockManager } from "./wakeLock";

export type Screen = "start" | "mode" | "passcode" | "camera" | "reading" | "ask" | "settings";
export type FocusTarget = "heading" | "transcript" | "error";

export interface UiState {
  screen: Screen;
  /** Where Settings and Ask return to. */
  returnTo: Screen;
  cameraStatus: "off" | "starting" | "live" | "error";
  cameraError: CameraErrorKind | null;
  capturing: boolean;
  passcodeBusy: boolean;
  passcodeError: string | null;
  /** Small on-screen error text (technical detail never goes to speech). */
  errorText: string | null;
  /** VoiceOver mode only: "Play with app voice" was pressed for the current document. */
  docAppVoice: boolean;
  /** The page number being captured when adding a page, or null for a new document. */
  addingPage: number | null;
  /** Heading of the camera screen: "Camera", "Add page 2", or "Retake page 2". */
  cameraTitle: string;
  /** Which of the camera screen's modes is showing: the live camera, a PDF, or a photo. */
  cameraMode: CameraMode;
  /** Screens move focus when this changes. */
  focus: { target: FocusTarget; seq: number };
  /** The browser has no speech engine: everything goes to the live region and a banner shows. */
  speechUnavailable: boolean;
}

export interface AskTurn {
  id: number;
  question: string;
  answer: string;
  status: "streaming" | "done" | "error";
  error?: string;
}

export interface AskState {
  turns: AskTurn[];
  busy: boolean;
  listening: boolean;
  /** Text recognized so far while listening (shown in the question field). */
  heard: string;
  recognitionAvailable: boolean;
}

export const UI_LANG = "en";
export const ASK_INTRO = "Ask your question, then press Send. Or press Talk and say it.";
export const ASK_AGAIN = "Ask another question, or press Back to reading.";

export const FIRST_LAUNCH_QUESTION =
  "Document Reader. Do you use VoiceOver? Tap the top half of the screen for yes, or the bottom half for no.";
export const CAMERA_PERMISSION_LINE = "I need the camera to see the page. Tap Allow if your phone asks.";
export const CAMERA_INTRO = "Camera ready.";
/** How long the box around the page stays after the page is lost. */
const OUTLINE_HOLD_MS = 400;

export interface ControllerEnv {
  port: SpeechPort;
  timers: Timers;
  local: StorageLike | null;
  session: StorageLike | null;
  api: ApiClient;
  wakeLock?: { setWanted(wanted: boolean): void };
  /** Monotonic clock in milliseconds. */
  now?: () => number;
}

export function browserEnv(): ControllerEnv {
  return {
    port: new BrowserSpeechPort(),
    timers: {
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (handle) => window.clearTimeout(handle as number),
    },
    local: safeStorage("local"),
    session: safeStorage("session"),
    api: createApiClient(),
    wakeLock: new WakeLockManager(),
  };
}

/**
 * Owns every long-lived object in the browser and runs the app's flows. React screens read its
 * stores and call its methods; nothing long-lived lives in a component.
 */
export class AppController {
  readonly ui: Store<UiState>;
  readonly settings: Store<Settings>;
  readonly speaker: Speaker;
  readonly reader: Reader;
  readonly live: LiveRegions;
  readonly announcer: Announcer;
  readonly sounds: Sounds;
  readonly session: DocumentSession;
  /** Voices the phone offers (they load asynchronously on iOS). */
  readonly voices: Store<VoiceInfo[]>;
  readonly ask: Store<AskState>;
  /** The box drawn around the page on the camera screen. */
  readonly outline = new Store<PageOutline>(NO_OUTLINE);

  private readonly env: ControllerEnv;
  private passcode: string | null;
  private camera: CameraHandle | null = null;
  private cameraWaiters: Array<(camera: CameraHandle | null) => void> = [];
  private videoToken = 0;
  private videoEl: HTMLVideoElement | null = null;
  private resumeOnReturn = false;
  private pausedByHide = false;
  private cameraIntroPending: "full" | "addPage" | "retake" | "none" = "full";
  private readonly sampler = new FrameSampler();
  /** A separate canvas for judging the frames of a burst, so the analysis canvas keeps its size. */
  private readonly burstSampler = new FrameSampler();
  private tracker = new FramingTracker();
  private readonly cuePolicy = new CuePolicy();
  private analysisTimer: unknown = null;
  /** When the page was last seen, so the box survives a frame or two without it. */
  private outlineSeenAt = -Infinity;
  /** The camera's view when the last picture was taken: the same view is not taken again. */
  private lastCaptureView: Luma | null = null;
  /** Automatic capture fires at most once per visit to the camera screen (PROMPT.md 6.3). */
  private armed = false;
  private torchTried = false;
  /** Whether the last picture was taken automatically (a retry then counts against the back-off). */
  private lastCaptureAutomatic = false;
  /** Automatic pictures in a row that the model could not read. */
  private autoRetries = 0;
  private readonly cleanups: Array<() => void> = [];
  private answerSpeech: StreamingSpeech | null = null;
  private askAbort: AbortController | null = null;
  private readonly listener = new Listener();
  private nextTurnId = 1;
  private newDocumentArmedUntil = 0;
  /** The page being retaken (its partial text is replaced when the new photo is captured). */
  private retakeTarget: number | null = null;
  /** An answer interrupted by the page being hidden is spoken again on return. */
  private answerReplay: "none" | "onReturn" | "whenDone" = "none";
  private readonly tickers = new Map<string, unknown>();

  constructor(env: ControllerEnv = browserEnv()) {
    this.env = env;
    this.settings = new Store<Settings>(loadSettings(env.local));
    this.passcode = loadPasscode(env.local);
    this.ui = new Store<UiState>({
      screen: "start",
      returnTo: "camera",
      cameraStatus: "off",
      cameraError: null,
      capturing: false,
      passcodeBusy: false,
      passcodeError: null,
      errorText: null,
      docAppVoice: false,
      addingPage: null,
      cameraTitle: "Camera",
      cameraMode: "camera",
      focus: { target: "heading", seq: 0 },
      speechUnavailable: false,
    });
    this.speaker = new Speaker({
      port: env.port,
      timers: env.timers,
      defaultLang: UI_LANG,
      defaultRate: () => this.settings.get().rate,
      voiceFor: (lang) => pickVoice(env.port.getVoices(), lang, this.settings.get().voiceURI)?.voiceURI ?? null,
    });
    this.sounds = new Sounds(() => this.settings.get().sounds);
    this.reader = new Reader({
      speaker: this.speaker,
      timers: env.timers,
      rate: () => this.settings.get().rate,
      uiLang: UI_LANG,
      tick: () => this.sounds.tick(),
    });
    this.live = new LiveRegions(env.timers);
    this.announcer = new Announcer({
      speaker: this.speaker,
      live: this.live,
      channel: () => this.channel(),
      uiLang: UI_LANG,
    });
    this.session = new DocumentSession({ api: env.api, passcode: () => this.passcode, storage: env.session });
    this.voices = new Store<VoiceInfo[]>(env.port.getVoices());
    this.ask = new Store<AskState>({
      turns: [],
      busy: false,
      listening: false,
      heard: "",
      recognitionAvailable: typeof window !== "undefined" && recognitionAvailable(),
    });
    this.cleanups.push(env.port.onVoicesChanged(() => this.voices.set(env.port.getVoices())));
  }

  /** Browser-level listeners. Returns a function that removes them. */
  install(): () => void {
    if (typeof document === "undefined") return () => undefined;
    const onVisibility = () => this.handleVisibility(document.visibilityState === "visible");
    const onPageHide = () => this.speaker.cancelAll();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    this.cleanups.push(() => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    });
    return () => this.dispose();
  }

  dispose(): void {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.detachVideo();
    this.stopLoadingTicker();
    this.speaker.cancelAll();
  }

  // -------------------------------------------------------------------------
  // Channels and announcements
  // -------------------------------------------------------------------------

  /** Principle 1: announcements go to the app voice or to the live region, never both. */
  channel(): Channel {
    if (this.ui.get().speechUnavailable) return "live";
    return this.settings.get().mode === "voiceOver" && !this.ui.get().docAppVoice ? "live" : "speech";
  }

  get appVoiceActive(): boolean {
    return this.channel() === "speech";
  }

  say(text: string, opts?: AnnounceOptions): boolean {
    return this.announcer.say(text, opts);
  }

  private fail(message: string, detail?: string): void {
    this.sounds.error();
    this.ui.update({ errorText: detail ?? null });
    this.announcer.say(message, { alert: true });
    this.requestFocus("error");
  }

  requestFocus(target: FocusTarget): void {
    this.ui.update({ focus: { target, seq: this.ui.get().focus.seq + 1 } });
  }

  private navigate(screen: Screen): void {
    const from = this.ui.get().screen;
    if (screen !== "camera" && from === "camera") this.ui.update({ capturing: false });
    // Whatever takes the user away from Ask (Back, or a failed page read) ends its work there.
    if (from === "ask" && screen !== "ask") this.teardownAsk();
    this.ui.update({ screen, errorText: null, focus: { target: "heading", seq: this.ui.get().focus.seq + 1 } });
    // Keep the screen on while framing a page, listening to one, or hearing an answer.
    this.env.wakeLock?.setWanted(screen === "camera" || screen === "reading" || screen === "ask");
  }

  /**
   * A short message that must not silently stop reading: while the app voice is reading, the
   * reader says it and carries on; otherwise it is an ordinary announcement.
   */
  private notify(text: string): void {
    if (this.appVoiceActive && this.ui.get().screen === "reading" && this.reader.isActive) this.reader.notice(text);
    else this.say(text);
  }

  /** For controls whose new state VoiceOver reads by itself (sliders, switches, pickers). */
  private sayUnlessVoiceOver(text: string): void {
    if (this.channel() === "speech") this.say(text);
  }

  // -------------------------------------------------------------------------
  // Start, mode, passcode
  // -------------------------------------------------------------------------

  /** The Start tap. Unlocks speech and sound (iOS needs a tap first), then continues. */
  start(): void {
    this.sounds.unlock();
    this.env.port.prime();
    if (!this.env.port.available) {
      // No speech engine (some embedded browsers): VoiceOver can still read everything.
      this.ui.update({ speechUnavailable: true });
    }
    if (this.settings.get().mode === null) {
      // First launch: the mode is unknown, so the question is always spoken (or, without a
      // speech engine, announced for VoiceOver).
      if (this.ui.get().speechUnavailable) this.say(FIRST_LAUNCH_QUESTION);
      else this.speaker.speak(FIRST_LAUNCH_QUESTION, { priority: "high", lang: UI_LANG });
      this.navigate("mode");
      return;
    }
    this.continueAfterMode();
  }

  chooseMode(mode: Mode): void {
    this.speaker.cancelAll();
    this.updateSettings({ mode });
    this.say(
      mode === "voiceOver"
        ? "VoiceOver mode. I'll stay quiet and let VoiceOver speak."
        : "Read-aloud mode. I'll read everything to you.",
    );
    this.continueAfterMode();
  }

  private continueAfterMode(): void {
    if (!this.passcode) {
      this.navigate("passcode");
      this.say("Enter the passcode, then press Continue.");
      return;
    }
    this.continueAfterPasscode();
  }

  async submitPasscode(input: string): Promise<void> {
    const code = input.trim();
    if (!code) {
      this.ui.update({ passcodeError: "Type the passcode first." });
      this.fail("Type the passcode first.");
      return;
    }
    if (this.ui.get().passcodeBusy) return;
    this.ui.update({ passcodeBusy: true, passcodeError: null });
    try {
      await this.env.api.checkPasscode(code);
      this.passcode = code;
      savePasscode(this.env.local, code);
      this.ui.update({ passcodeBusy: false });
      this.say("Passcode accepted.");
      this.continueAfterPasscode();
    } catch (err) {
      const errCode: ErrorCode = err instanceof ApiError ? err.code : "network";
      const message = errCode === "unauthorized" ? "That passcode is not right. Try again." : spokenError(errCode, "auth");
      this.ui.update({ passcodeBusy: false, passcodeError: message });
      this.fail(message);
    }
  }


  private continueAfterPasscode(): void {
    const doc = this.session.doc;
    if (doc && doc.pages.length > 0) {
      this.restoreDocument(doc);
      return;
    }
    void this.openCamera({ first: true });
  }

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------

  private async openCamera(opts: {
    first?: boolean;
    addPage?: number | null;
    retake?: number;
    intro?: "full" | "addPage" | "retake" | "none";
  }): Promise<void> {
    const page = opts.retake ?? opts.addPage ?? null;
    const cameraTitle = opts.retake ? `Retake page ${opts.retake}` : opts.addPage ? `Add page ${opts.addPage}` : "Camera";
    this.ui.update({ addingPage: page, cameraTitle, cameraError: null, cameraMode: "camera" });
    this.cameraIntroPending = opts.intro ?? (opts.retake ? "retake" : opts.addPage ? "addPage" : "full");
    if (opts.first && !(await cameraPermissionGranted())) this.say(CAMERA_PERMISSION_LINE);
    this.navigate("camera");
  }

  /** Called by the Camera screen when its video element mounts. */
  async attachVideo(video: HTMLVideoElement): Promise<void> {
    this.detachVideo();
    const token = ++this.videoToken;
    this.videoEl = video;
    this.ui.update({ cameraStatus: "starting", cameraError: null });
    try {
      const camera = await startCamera(video);
      if (token !== this.videoToken) {
        camera.stop();
        return;
      }
      this.camera = camera;
      this.ui.update({ cameraStatus: "live" });
      this.resolveCameraWaiters(camera);
      console.info("camera started", camera.info());
      this.speakCameraIntro();
      this.startGuidance();
    } catch (err) {
      if (token !== this.videoToken) return;
      const kind: CameraErrorKind = err instanceof CameraError ? err.kind : "unknown";
      this.ui.update({ cameraStatus: "error", cameraError: kind });
      this.resolveCameraWaiters(null);
      this.fail(cameraMessage(kind), err instanceof Error ? err.message : undefined);
    }
  }

  private resolveCameraWaiters(camera: CameraHandle | null): void {
    for (const resolve of this.cameraWaiters.splice(0)) resolve(camera);
  }

  /** The live camera, waiting up to `ms` for one that is still starting. */
  private waitForCamera(ms: number): Promise<CameraHandle | null> {
    if (this.camera) return Promise.resolve(this.camera);
    if (this.ui.get().cameraStatus !== "starting") return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = this.env.timers.setTimeout(() => {
        this.cameraWaiters = this.cameraWaiters.filter((w) => w !== done);
        resolve(this.camera);
      }, ms);
      const done = (camera: CameraHandle | null) => {
        this.env.timers.clearTimeout(timer);
        resolve(camera);
      };
      this.cameraWaiters.push(done);
    });
  }

  /** Called when the Camera screen unmounts (and before re-attaching). */
  detachVideo(): void {
    this.videoToken += 1;
    this.videoEl = null;
    this.stopGuidance();
    this.outline.set(NO_OUTLINE);
    this.resolveCameraWaiters(null);
    if (this.camera) {
      void this.camera.setTorch(false);
      this.camera.stop();
      this.camera = null;
    }
    if (this.ui.get().cameraStatus !== "off") this.ui.update({ cameraStatus: "off" });
  }

  // -------------------------------------------------------------------------
  // Framing guidance and automatic capture (PROMPT.md 6.2 and 6.3)
  // -------------------------------------------------------------------------

  private startGuidance(): void {
    this.stopGuidance();
    if (this.ui.get().cameraMode !== "camera") return;
    this.tracker = new FramingTracker();
    this.tracker.calmMs = this.calmMsForRetries();
    // After New document, Add page, or a page that could not be read, the page just photographed
    // is often still in view: wait for the view to change. A retake means the same page again.
    this.tracker.requireChangeFrom(this.retakeTarget === null ? this.lastCaptureView : null);
    this.cuePolicy.reset();
    this.outline.set(NO_OUTLINE);
    this.armed = true;
    this.torchTried = false;
    this.scheduleAnalysis(250);
  }

  /**
   * The lenient capture waits longer after each automatic picture the model could not read, and
   * after three in a row it stops: the user then presses Capture (or the strict checks pass).
   */
  private calmMsForRetries(): number {
    return this.autoRetries >= 3 ? Infinity : FRAMING.calmMs * (1 + this.autoRetries);
  }

  private stopGuidance(): void {
    if (this.analysisTimer !== null) {
      this.env.timers.clearTimeout(this.analysisTimer);
      this.analysisTimer = null;
    }
  }

  /** About seven frames a second on a 160-pixel-wide copy of the preview. */
  private scheduleAnalysis(ms = 140): void {
    this.stopGuidance();
    this.analysisTimer = this.env.timers.setTimeout(() => this.analyzeFrame(), ms);
  }

  private now(): number {
    return this.env.now ? this.env.now() : performance.now();
  }

  private analyzeFrame(): void {
    this.analysisTimer = null;
    const camera = this.camera;
    if (!camera || this.ui.get().screen !== "camera") return;
    if (this.ui.get().capturing || document.visibilityState !== "visible") {
      this.scheduleAnalysis();
      return;
    }
    const video = camera.video;
    const frame = this.sampler.sample(video, video.videoWidth, video.videoHeight);
    if (frame) {
      const now = this.now();
      const situation = this.tracker.update(frame, now);
      this.showOutline(situation, now);
      if (situation.kind === "ready" && this.armed && this.settings.get().autoCapture) {
        void this.autoCapture();
        return;
      }
      this.guide(situation, now);
    }
    this.scheduleAnalysis();
  }

  /**
   * The box around the page: white while the page is being lined up, green when it is ready and
   * the picture is taken. A page lost for a frame or two keeps its box, so it does not flicker.
   */
  private showOutline(situation: Situation, now: number): void {
    const analysis = this.tracker.lastAnalysis;
    // The box means "I see a page with writing": nothing is outlined around a wall or a table.
    const quad = this.tracker.lastIsDocument ? analysis?.page.quad : null;
    if (analysis && quad) {
      this.outlineSeenAt = now;
      this.outline.set({ quad: normalizeQuad(quad, analysis.luma.width, analysis.luma.height), ready: situation.kind === "ready" });
    } else if (now - this.outlineSeenAt > OUTLINE_HOLD_MS && this.outline.get().quad) {
      this.outline.set(NO_OUTLINE);
    }
  }

  private guide(situation: Situation, now: number): void {
    const camera = this.camera;
    if (situation.kind === "dark" && camera && !this.torchTried && camera.hasTorch()) {
      this.torchTried = true;
      void camera.setTorch(true).then((on) => {
        if (on) this.say("It's dark, so I turned on the light.", { priority: "low" });
      });
      return;
    }
    const settings = this.settings.get();
    const cue = this.cuePolicy.next(situation, now, { guidance: settings.guidance, autoCapture: settings.autoCapture });
    if (cue && this.say(cue, { priority: "low" })) this.cuePolicy.spoken(cue, now);
  }

  private async autoCapture(): Promise<void> {
    const camera = this.camera;
    if (!camera || this.ui.get().capturing) return;
    this.armed = false;
    this.lastCaptureAutomatic = true;
    this.lastCaptureView = this.tracker.lastAnalysis?.luma ?? null;
    this.ui.update({ capturing: true });
    this.sounds.shutter();
    try {
      const still = await camera.captureStill(this.burstOptions());
      const sample = this.sampler.sample(still.source, still.width, still.height);
      if (sample && !this.tracker.isStillSharp(sample)) {
        if (typeof ImageBitmap !== "undefined" && still.source instanceof ImageBitmap) still.source.close();
        this.retryAutoCapture("Blurry. Hold still.");
        return;
      }
      await this.processCapture(still.source, still.width, still.height);
    } catch (err) {
      console.warn("automatic capture failed", err);
      this.retryAutoCapture("I couldn't take the picture. Hold still and I'll try again.");
    }
  }

  private retryAutoCapture(message: string): void {
    this.ui.update({ capturing: false });
    this.outline.update({ ready: false });
    this.tracker.resetSteady();
    this.armed = true;
    this.say(message);
    this.scheduleAnalysis(600);
  }

  private speakCameraIntro(): void {
    const intro = this.cameraIntroPending;
    this.cameraIntroPending = "none";
    // A swipe to another mode while the camera was starting has already said where the user is.
    if (this.ui.get().cameraMode !== "camera") return;
    const page = this.ui.get().addingPage ?? this.session.nextPageNumber;
    // Until the user has changed mode once, the app voice mentions the swipe. (VoiceOver users
    // cannot swipe here: VoiceOver takes the gesture. They find the modes as tabs.)
    const hint = this.channel() === "speech" && !this.settings.get().modesLearned;
    if (intro === "full") this.say(hint ? `${CAMERA_INTRO} ${MODES_HINT}` : CAMERA_INTRO);
    else if (intro === "addPage") this.say(`Add page ${page}.`);
    else if (intro === "retake") this.say(`Retake page ${page}.`);
  }

  /**
   * Moves the camera screen to another mode (PDF, Camera, Photos) and says which. Framing
   * guidance and automatic capture run only in Camera mode.
   */
  setCameraMode(mode: CameraMode): void {
    const ui = this.ui.get();
    if (ui.screen !== "camera" || ui.capturing) return;
    if (!this.settings.get().modesLearned) this.updateSettings({ modesLearned: true });
    if (mode !== ui.cameraMode) {
      this.ui.update({ cameraMode: mode, errorText: null });
      if (mode === "camera") {
        if (this.camera) this.startGuidance();
      } else {
        this.stopGuidance();
        this.outline.set(NO_OUTLINE);
        if (this.camera) void this.camera.setTorch(false);
      }
    }
    // VoiceOver reads the selected tab itself.
    this.sayUnlessVoiceOver(CAMERA_MODE_LINES[mode]);
  }

  /** A sideways swipe on the camera screen. At either end it says the current mode again. */
  swipeCameraMode(direction: SwipeDirection): void {
    const current = this.ui.get().cameraMode;
    this.setCameraMode(modeAfterSwipe(current, direction) ?? current);
  }

  /** Without a full-sensor photo, the sharpest of four video frames taken 90 ms apart. */
  private burstOptions(): { burst: number; intervalMs: number; score: (frame: HTMLCanvasElement) => number } {
    return {
      burst: 4,
      intervalMs: 90,
      score: (frame) => {
        const sample = this.burstSampler.sampleCenter(frame, frame.width, frame.height);
        return sample ? laplacianVariance(toLuma(sample)) : 0;
      },
    };
  }

  /** The Capture button: takes the picture at once, with no framing checks (principle 4). */
  async captureManual(): Promise<void> {
    if (this.ui.get().capturing) return;
    this.armed = false;
    this.lastCaptureAutomatic = false;
    this.autoRetries = 0;
    this.ui.update({ capturing: true });
    const camera = await this.waitForCamera(5000);
    if (!camera) {
      this.ui.update({ capturing: false });
      this.say("The camera isn't working. Press Use phone camera instead.");
      return;
    }
    this.lastCaptureView = this.tracker.lastAnalysis?.luma ?? null;
    this.sounds.shutter();
    try {
      const still = await camera.captureStill(this.burstOptions());
      await this.processCapture(still.source, still.width, still.height);
    } catch (err) {
      this.ui.update({ capturing: false });
      this.armed = true;
      this.fail("I couldn't take the picture. Press Capture to try again.", err instanceof Error ? err.message : undefined);
    }
  }

  /** A photo chosen with the phone's own camera app ("Use phone camera instead"). */
  async captureFromFile(file: File): Promise<void> {
    if (this.ui.get().capturing) return;
    this.armed = false;
    this.lastCaptureAutomatic = false;
    this.autoRetries = 0;
    this.ui.update({ capturing: true });
    try {
      const image = await imageFromFile(file);
      await this.processCapture(image.source, image.width, image.height);
    } catch (err) {
      this.ui.update({ capturing: false });
      this.armed = true;
      this.fail("I couldn't open that photo. Please try again.", err instanceof Error ? err.message : undefined);
    }
  }

  private async processCapture(source: CanvasImageSource, width: number, height: number): Promise<void> {
    const image = await prepareImage(source, width, height);
    if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) source.close();
    console.info("captured", { width: image.width, height: image.height, bytes: image.bytes, enhanced: image.enhanced });
    this.say("Got it. Reading.");
    this.ui.update({ capturing: false });
    this.startPageRead({ image });
  }

  /** A PDF picked from the phone's files ("Open a PDF"). All its pages are read in order. */
  async openPdf(file: File): Promise<void> {
    if (this.ui.get().capturing) return;
    if (this.session.readingPdf || this.session.awaitingFirstLine) {
      this.notify("Wait a moment, I'm still reading.");
      return;
    }
    if (!isPdfFile(file)) {
      this.fail("That file is not a PDF. Choose a file whose name ends in .pdf.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      this.fail("That PDF is too large. The limit is 15 megabytes.");
      return;
    }
    this.armed = false;
    this.lastCaptureAutomatic = false;
    this.autoRetries = 0;
    this.ui.update({ capturing: true });
    let pdf: PreparedPdf;
    try {
      pdf = { base64: await blobToBase64(file), bytes: file.size };
    } catch (err) {
      this.ui.update({ capturing: false });
      this.armed = true;
      this.fail("I couldn't open that PDF. Please try again.", err instanceof Error ? err.message : undefined);
      return;
    }
    console.info("pdf opened", { bytes: pdf.bytes });
    this.say("Got it. Reading the PDF.");
    this.ui.update({ capturing: false });
    this.startPageRead({ pdf });
  }

  // -------------------------------------------------------------------------
  // Reading a page
  // -------------------------------------------------------------------------

  private startPageRead(source: { image: PreparedImage } | { pdf: PreparedPdf }): void {
    const retake = this.retakeTarget;
    this.retakeTarget = null;
    if (retake !== null) {
      // The new photo replaces the page that could only be read in part.
      this.reader.removePage(retake);
      this.session.removeLastPage(retake);
    }
    const adding = (this.session.doc?.pages.length ?? 0) > 0;
    const pageNumber = this.session.nextPageNumber;
    if (!adding) {
      this.reader.reset();
      this.ui.update({ docAppVoice: false });
    }
    this.reader.setLoading(true);
    this.navigate("reading");
    this.requestFocus("heading");
    if (this.appVoiceActive) {
      if (adding) this.reader.continueAfterAddPage(pageNumber);
      else this.reader.play();
    } else {
      this.startLoadingTicker();
    }

    const isPdf = "pdf" in source;
    const callbacks = this.pageReadCallbacks(adding, pageNumber, isPdf);
    const read = (isPdf ? this.session.readPdf(source.pdf, callbacks) : this.session.readPage(source.image, callbacks)).then(
      (outcome) => {
        // A PDF read to the end in VoiceOver mode: say once that every page is there.
        const pages = this.session.doc?.pages.filter((p) => p.fromPdf && p.number >= pageNumber).length ?? 0;
        if (isPdf && outcome === "ok" && pages > 1 && !this.appVoiceActive) this.say(`All ${pages} pages are ready.`);
      },
    );
    // The session counts a read as finished only after its stream closes; then the reader knows
    // no more text is coming and can announce the end of the document.
    void read.then(() => this.reader.setLoading(this.session.isReading));
  }

  /** What happens as a page read (or a PDF read, page by page) streams in. */
  private pageReadCallbacks(adding: boolean, pageNumber: number, isPdf: boolean): PageReadCallbacks {
    return {
      onRetry: (problem) => {
        this.stopLoadingTicker();
        this.quietReaderAfterFailedCapture(adding);
        this.sounds.error();
        this.say(problem, { alert: true });
        if (this.lastCaptureAutomatic) {
          this.autoRetries += 1;
          if (this.autoRetries === 3) this.say("I'll wait for you to press Capture.");
        }
        void this.openCamera({ addPage: adding ? pageNumber : null, intro: "none" });
      },
      onPageStart: (page, meta) => {
        this.autoRetries = 0;
        this.stopLoadingTicker();
        this.sounds.pageFound();
        this.reader.beginPage(page.number, { title: meta.title, language: meta.language });
        // In VoiceOver mode only the first page of a PDF is announced as it starts; each later
        // page gets a short "Page N ready." when it is complete.
        const laterPdfPage = page.fromPdf && page.number > pageNumber;
        if (!this.appVoiceActive && !laterPdfPage) this.say(liveTitleAnnouncement(page, meta));
      },
      onBlock: (page, index, block) => {
        this.reader.addBlock(page.number, index, block.kind, block.text);
      },
      onPageDone: (page) => {
        this.reader.completePage(page.number);
        this.announcePageDone(page, page.fromPdf === true && page.number > pageNumber);
      },
      onError: (code, message, page) => {
        this.stopLoadingTicker();
        if (page) {
          this.reader.completePage(page.number);
          // Stop here rather than reading on to "End of document": the user chooses what next.
          this.reader.pause({ silent: true });
        } else {
          this.quietReaderAfterFailedCapture(adding);
        }
        if (code === "unauthorized") {
          this.passcode = null;
          forgetPasscode(this.env.local);
          this.navigate("passcode");
          this.fail("The passcode was not accepted. Please enter it again.");
          return;
        }
        if (page) {
          this.fail(partialPageMessage(page.number, this.canRetake(page.number), this.appVoiceActive), `Reading stopped early: ${code}`);
          return;
        }
        const spoken = isPdf && code === "too_large" ? "That PDF is too large to send. Try a smaller file." : message;
        this.fail(spoken, `Reading failed: ${code}`);
        void this.openCamera({ addPage: adding ? pageNumber : null, intro: "none" });
      },
    };
  }

  /**
   * Nothing was read from the capture, so the app is going back to the camera. The reader must
   * not carry on (or announce the end of the document) while the user is framing the page again.
   */
  private quietReaderAfterFailedCapture(adding: boolean): void {
    if (adding) {
      this.reader.suspend();
      this.reader.setLoading(this.session.isReading);
    } else {
      this.reader.reset();
    }
  }

  private announcePageDone(page: DocPage, laterPdfPage = false): void {
    if (page.blocks.length === 0) {
      if (!page.fromPdf) this.say("I couldn't find any text on this page. Try again or try another page.");
      return;
    }
    if (this.appVoiceActive) return; // the reader speaks the page itself
    if (laterPdfPage) {
      this.say(`Page ${page.number} ready.`, { priority: "low" });
      return;
    }
    const count = page.blocks.length;
    this.say(`Page ${page.number} ready. ${count} ${count === 1 ? "paragraph" : "paragraphs"}. Swipe right to read.`);
    this.requestFocus("transcript");
  }

  /** In VoiceOver mode nothing speaks while waiting for the first line, so tick instead. */
  private startLoadingTicker(): void {
    this.startTicker("page");
  }

  private stopLoadingTicker(): void {
    this.stopTicker("page");
  }

  /** A soft tick every two seconds (after two seconds) until stopped. */
  private startTicker(name: string): void {
    this.stopTicker(name);
    const tick = () => {
      this.sounds.tick();
      this.tickers.set(name, this.env.timers.setTimeout(tick, 2000));
    };
    this.tickers.set(name, this.env.timers.setTimeout(tick, 2000));
  }

  private stopTicker(name: string): void {
    const handle = this.tickers.get(name);
    if (handle !== undefined) {
      this.env.timers.clearTimeout(handle);
      this.tickers.delete(name);
    }
  }

  private restoreDocument(doc: Doc): void {
    this.reader.reset();
    for (const page of doc.pages) {
      this.reader.beginPage(page.number, { title: page.title, language: page.language });
      page.blocks.forEach((block, index) => this.reader.addBlock(page.number, index, block.kind, block.text));
      this.reader.completePage(page.number);
    }
    this.navigate("reading");
    const title = sentence(doc.title);
    this.say(
      this.appVoiceActive
        ? `Your document is still here: ${title} Press Play to hear it, or New document to start again.`
        : `Your document is still here: ${title} Swipe right to read it, or find New document to start again.`,
    );
  }

  // -------------------------------------------------------------------------
  // Reading controls
  // -------------------------------------------------------------------------

  togglePlay(): void {
    this.reader.toggle();
  }
  back(): void {
    this.reader.previous();
  }
  forward(): void {
    this.reader.next();
  }
  previousParagraph(): void {
    this.reader.previousParagraph();
  }
  nextParagraph(): void {
    this.reader.nextParagraph();
  }
  spell(): void {
    this.reader.spell();
  }
  slower(): void {
    this.changeRate(-RATE_STEP);
  }
  faster(): void {
    this.changeRate(RATE_STEP);
  }

  private changeRate(delta: number): void {
    const before = this.settings.get().rate;
    const rate = clampRate(before + delta);
    if (rate === before) {
      this.notify(delta > 0 ? "That is the fastest speed." : "That is the slowest speed.");
      return;
    }
    this.updateSettings({ rate });
    this.reader.rateChanged();
  }

  /** VoiceOver mode: turn the app's reader on for this document. */
  playWithAppVoice(): void {
    if (!this.reader.hasContent) {
      this.say("Wait a moment, I'm still reading the page.");
      return;
    }
    this.ui.update({ docAppVoice: true });
    this.reader.play();
  }

  /**
   * Clears the document. When there is one, the first press only explains; a second press within
   * six seconds clears it, so a stray tap never throws a document away.
   */
  newDocument(): void {
    const hasDoc = (this.session.doc?.pages.length ?? 0) > 0;
    const now = this.now();
    if (hasDoc && now > this.newDocumentArmedUntil) {
      this.newDocumentArmedUntil = now + 6000;
      this.notify("Press New document again to clear this document and start a new one.");
      return;
    }
    this.newDocumentArmedUntil = 0;
    this.retakeTarget = null;
    this.autoRetries = 0;
    this.teardownAsk();
    this.ask.update({ turns: [], busy: false });
    this.reader.reset();
    this.session.newDocument();
    this.stopLoadingTicker();
    this.ui.update({ docAppVoice: false, addingPage: null });
    this.say("New document.");
    void this.openCamera({});
  }

  addPage(): void {
    if (this.session.readingPdf) {
      this.notify("Wait a moment, I'm still reading the PDF.");
      return;
    }
    if (this.session.awaitingFirstLine) {
      this.notify("Wait a moment, I'm still reading the last page.");
      return;
    }
    if (!this.session.doc?.pages.length) {
      this.notify("Read a page first, then you can add another.");
      return;
    }
    this.reader.suspend();
    void this.openCamera({ addPage: this.session.nextPageNumber });
  }

  /**
   * Whether a page that stopped part way can be photographed again: only the last page, and only
   * when no other page is still being read (the read that just failed still counts as one).
   */
  private canRetake(pageNumber: number): boolean {
    const pages = this.session.doc?.pages ?? [];
    const last = pages[pages.length - 1];
    return last?.number === pageNumber && !last.fromPdf && this.session.store.get().activeReads <= 1;
  }

  /** Photographs again the last page, which could only be read in part. */
  retakePage(): void {
    const doc = this.session.doc;
    const last = doc?.pages[doc.pages.length - 1];
    if (!last?.failed || last.fromPdf) {
      this.notify("Only a photographed page that could not be read completely can be retaken.");
      return;
    }
    if (this.session.isReading) {
      this.notify("Wait a moment, I'm still reading.");
      return;
    }
    this.reader.suspend();
    this.retakeTarget = last.number;
    void this.openCamera({ retake: last.number });
  }

  /** From the camera (while adding or retaking a page), Ask, or Settings. */
  backToReading(): void {
    this.retakeTarget = null;
    this.ui.update({ addingPage: null });
    this.navigate("reading");
    this.afterReturnToReading();
  }

  private afterReturnToReading(): void {
    const resume = this.resumeOnReturn;
    this.resumeOnReturn = false;
    if (!this.reader.hasContent) return;
    if (!this.appVoiceActive) {
      this.say("Back to reading.");
      return;
    }
    if (resume) this.reader.resume();
    else if (this.reader.currentStatus === "ended") this.say("End of document. Press Play to hear it again.");
    else this.say(`${this.reader.positionReport("Paused")} Press Play to continue.`);
  }

  // -------------------------------------------------------------------------
  // Questions (PROMPT.md screen 3 and 6.6)
  // -------------------------------------------------------------------------

  openAsk(): void {
    if (!this.session.doc?.pages.length) {
      this.notify(
        this.session.awaitingFirstLine
          ? "Wait a moment, I'm still reading the page. Then you can ask about it."
          : "Read a page first, then you can ask about it.",
      );
      return;
    }
    const from = this.ui.get().screen;
    this.resumeOnReturn = from === "reading" ? this.reader.suspend() : false;
    this.ui.update({ returnTo: "reading" });
    this.navigate("ask");
    this.say(ASK_INTRO);
  }

  closeAsk(): void {
    this.navigate("reading"); // navigate() ends listening and any answer in progress
    this.afterReturnToReading();
  }

  /** Ends everything the Ask screen started: listening, speaking, and a streaming answer. */
  private teardownAsk(): void {
    this.stopListening(true);
    this.stopAnswer();
    this.askAbort?.abort();
    this.askAbort = null;
    this.stopTicker("answer");
    this.answerReplay = "none";
    const turns = this.ask.get().turns;
    const streaming = turns.some((t) => t.status === "streaming");
    this.ask.update({
      busy: false,
      listening: false,
      turns: streaming
        ? turns.map((t) => (t.status === "streaming" ? { ...t, status: "error" as const, error: "Stopped." } : t))
        : turns,
    });
  }

  /** Stops the answer being spoken (it stays on screen). */
  private stopAnswer(): void {
    this.answerSpeech?.stop();
    this.answerSpeech = null;
  }

  /**
   * Sends a question. Returns false when it was not accepted, so the screen keeps what was typed.
   */
  submitQuestion(input: string, opts: { spoken?: boolean } = {}): boolean {
    const question = input.trim();
    if (!question) {
      this.say("Type or say a question first.");
      return false;
    }
    if (this.ask.get().busy) {
      this.say("I'm still answering. Wait a moment, then send your question.");
      return false;
    }
    const doc = this.session.doc;
    if (!doc?.pages.length) {
      this.say("Read a page first, then you can ask about it.");
      return false;
    }
    const passcode = this.passcode;
    if (!passcode) {
      this.navigate("passcode");
      this.fail("The passcode was not accepted. Please enter it again.");
      return false;
    }
    // Send pressed while the microphone was still open: the question in the box is the one sent.
    if (!opts.spoken) this.stopListening(true);
    void this.runQuestion(question, doc, passcode, opts.spoken === true);
    return true;
  }

  private async runQuestion(question: string, doc: Doc, passcode: string, spoken: boolean): Promise<void> {
    this.stopAnswer();
    this.answerReplay = "none";
    // The last five questions and answers keep the request small. Failed and empty answers are
    // left out (the server rejects empty messages).
    const previous = this.ask
      .get()
      .turns.filter((t) => t.status === "done" && t.answer.trim() !== "")
      .slice(-5);
    const turn: AskTurn = { id: this.nextTurnId++, question, answer: "", status: "streaming" };
    this.ask.update({ turns: [...this.ask.get().turns, turn], busy: true, heard: "" });
    const update = (patch: Partial<AskTurn>) => {
      Object.assign(turn, patch);
      this.ask.update({ turns: [...this.ask.get().turns] });
    };
    if (spoken) this.say(`You asked: ${question}`);

    const speech = this.appVoiceActive
      ? new StreamingSpeech(this.speaker, {
          lang: UI_LANG,
          rate: () => this.settings.get().rate,
          onDone: () => this.say(ASK_AGAIN),
        })
      : null;
    this.answerSpeech = speech;
    // Each message is trimmed to what the server accepts, so one very long answer cannot make
    // every later question fail.
    const clip = (text: string) => text.slice(0, ASK_LIMITS.historyContent);
    const history: ChatTurn[] = previous.flatMap((t) => [
      { role: "user" as const, content: clip(t.question) },
      { role: "assistant" as const, content: clip(t.answer) },
    ]);
    const abort = new AbortController();
    this.askAbort = abort;
    this.startTicker("answer");
    try {
      await this.env.api.ask(
        { pages: docToAskPages(doc), title: doc.title, history, question },
        passcode,
        (event) => {
          if (abort.signal.aborted) return;
          if (event.type === "text") {
            this.stopTicker("answer");
            update({ answer: turn.answer + event.text });
            if (speech && this.answerSpeech === speech) speech.push(event.text);
          } else if (event.type === "done") {
            update({ status: "done" });
            if (this.answerReplay === "whenDone") {
              this.answerReplay = "none";
              this.say(`Here is the answer. ${turn.answer.trim()} ${ASK_AGAIN}`);
            } else if (this.answerReplay === "onReturn") {
              // The page is hidden; the answer is spoken when the user comes back.
            } else if (speech && this.answerSpeech === speech) {
              speech.finish();
            } else if (!speech) {
              this.say(`Answer: ${turn.answer.trim()} ${ASK_AGAIN}`);
            }
          } else {
            update({ status: "error", error: event.message });
            speech?.stop();
            this.fail(event.message);
          }
        },
        abort.signal,
      );
    } catch (err) {
      if (abort.signal.aborted) return;
      const code: ErrorCode = err instanceof ApiError ? err.code : "network";
      speech?.stop();
      update({ status: "error", error: spokenError(code, "ask") });
      if (code === "unauthorized") {
        this.passcode = null;
        forgetPasscode(this.env.local);
        this.navigate("passcode");
      }
      this.fail(spokenError(code, "ask"));
    } finally {
      // Only the current question tidies up; one that was stopped earlier must not touch the
      // ticker or busy state of a question asked after it.
      if (this.askAbort === abort) {
        this.stopTicker("answer");
        this.askAbort = null;
        this.ask.update({ busy: false });
      }
    }
  }

  /** The Talk button: starts listening, or stops and sends what was heard. */
  toggleListening(): void {
    if (this.ask.get().listening) {
      this.stopListening(false);
      return;
    }
    if (!recognitionAvailable()) {
      this.say("Speaking a question isn't available here. Type it instead; the keyboard's microphone key also works.");
      return;
    }
    if (this.ask.get().busy) {
      this.say("I'm still answering. Wait a moment, then ask again.");
      return;
    }
    // The app must not talk while the microphone is listening.
    this.stopAnswer();
    this.speaker.cancelAll();
    const started = this.listener.start(this.voiceLanguage().startsWith("en") ? "en-US" : this.voiceLanguage(), {
      onText: (text) => this.ask.update({ heard: text }),
      onEnd: (text, error) => {
        this.ask.update({ listening: false });
        if (text) {
          this.submitQuestion(text, { spoken: true });
          return;
        }
        if (error === "not-allowed" || error === "service-not-allowed") {
          this.say("I can't use the microphone. Type your question instead.");
        } else {
          this.say("I didn't hear a question. Press Talk and try again, or type it.");
        }
      },
    });
    if (!started) {
      this.say("I couldn't start listening. Type your question instead.");
      return;
    }
    this.ask.update({ listening: true, heard: "" });
    this.sounds.tick();
  }

  /** Stops listening. `discard` drops what was heard; otherwise it is sent as the question. */
  private stopListening(discard: boolean): void {
    if (this.listener.active) {
      if (discard) this.listener.abort();
      else this.listener.stop();
    }
    if (this.ask.get().listening) this.ask.update({ listening: false });
  }

  // -------------------------------------------------------------------------
  // Settings screen
  // -------------------------------------------------------------------------

  openSettings(): void {
    const from = this.ui.get().screen;
    if (from === "settings") return;
    this.resumeOnReturn = from === "reading" ? this.reader.suspend() : false;
    this.ui.update({ returnTo: from });
    this.navigate("settings");
  }

  closeSettings(): void {
    const to = this.ui.get().returnTo;
    this.navigate(to);
    if (to === "reading") this.afterReturnToReading();
    else if (to === "camera") this.cameraIntroPending = "none";
  }

  updateSettings(patch: Partial<Settings>): void {
    const next = { ...this.settings.get(), ...patch };
    next.rate = clampRate(next.rate);
    this.settings.set(next);
    saveSettings(this.env.local, next);
  }

  setMode(mode: Mode): void {
    if (this.settings.get().mode === mode) return;
    this.speaker.cancelAll();
    this.updateSettings({ mode });
    this.ui.update({ docAppVoice: false });
    this.say(
      mode === "voiceOver"
        ? "VoiceOver mode. I'll stay quiet and let VoiceOver speak."
        : "Read-aloud mode. I'll read everything to you.",
    );
  }

  /** The language whose voices Settings lists: the document's, or the interface language. */
  voiceLanguage(): string {
    return this.session.doc?.language ?? "en-US";
  }

  voiceChoices(): VoiceInfo[] {
    return voicesForLanguage(this.voices.get(), this.voiceLanguage());
  }

  /** The voice the app will actually use for the current language. */
  currentVoice(): VoiceInfo | null {
    return pickVoice(this.voices.get(), this.voiceLanguage(), this.settings.get().voiceURI);
  }

  setVoice(voiceURI: string | null): void {
    this.updateSettings({ voiceURI });
    const voice = this.currentVoice();
    this.sayUnlessVoiceOver(voice ? `Voice: ${voice.name}.` : "Voice: automatic.");
  }

  previewVoice(): void {
    const lang = this.voiceLanguage();
    this.speaker.speak(
      baseLang(lang) === "en" ? "This is how I will read your documents." : "This is how I will read this document.",
      { priority: "high", lang },
    );
  }

  /** `slider`: VoiceOver reads a slider's new value itself, so only the app voice repeats it. */
  setRate(rate: number, source: "slider" | "button" = "button"): void {
    const next = clampRate(rate);
    if (next === this.settings.get().rate) {
      if (source === "button") this.say(rate > next ? "That is the fastest speed." : "That is the slowest speed.");
      return;
    }
    this.updateSettings({ rate: next });
    const text = `Speed ${next.toFixed(1)}.`;
    if (source === "slider") this.sayUnlessVoiceOver(text);
    else this.say(text);
  }

  setAutoCapture(on: boolean): void {
    this.updateSettings({ autoCapture: on });
    this.sayUnlessVoiceOver(on ? "Automatic capture on." : "Automatic capture off. Press Capture to take each picture.");
  }

  setGuidance(guidance: Settings["guidance"]): void {
    this.updateSettings({ guidance });
    this.say(guidance === "full" ? "Full guidance." : "Minimal guidance. I'll only say hold still.");
  }

  setSounds(on: boolean): void {
    this.updateSettings({ sounds: on });
    this.sayUnlessVoiceOver(on ? "Sounds on." : "Sounds off.");
    if (on) this.sounds.tick();
  }

  setTheme(theme: Theme): void {
    this.updateSettings({ theme });
    this.sayUnlessVoiceOver(`${THEME_NAMES[theme]} colours.`);
  }

  // -------------------------------------------------------------------------
  // Page visibility (screen lock, app switch)
  // -------------------------------------------------------------------------

  private handleVisibility(visible: boolean): void {
    if (!visible) {
      // iOS stops speech when Safari is hidden; pause cleanly so the position is kept.
      if (this.reader.isActive) {
        this.reader.pause({ silent: true });
        this.pausedByHide = true;
      }
      if (this.ui.get().screen === "ask" && (this.answerSpeech?.active || this.ask.get().busy)) {
        this.stopAnswer();
        this.answerReplay = "onReturn";
      }
      this.speaker.cancelAll();
      return;
    }
    if (this.pausedByHide) {
      this.pausedByHide = false;
      this.say("Paused. Press Play to continue.");
    }
    if (this.answerReplay === "onReturn") {
      const turns = this.ask.get().turns;
      const last = turns[turns.length - 1];
      if (last?.status === "done") {
        this.answerReplay = "none";
        this.say(`Here is the answer again. ${last.answer.trim()} ${ASK_AGAIN}`);
      } else if (last?.status === "streaming") {
        this.answerReplay = "whenDone";
        this.say("Still answering.");
      } else {
        this.answerReplay = "none";
      }
    }
    // iOS may end the camera track while the page is hidden; restart it. If the track survived,
    // the preview element may still be paused, which would freeze the framing analysis.
    if (this.ui.get().screen === "camera" && this.videoEl) {
      if (this.camera?.track.readyState === "ended") {
        this.cameraIntroPending = "none";
        void this.attachVideo(this.videoEl);
      } else if (this.camera?.video.paused) {
        void this.camera.video.play().catch(() => undefined);
      }
    }
  }
}

function baseLang(tag: string): string {
  return tag.toLowerCase().split(/[-_]/)[0] ?? tag;
}

/** Ends a title with a full stop so the next sentence does not run into it when spoken. */
function sentence(text: string): string {
  const trimmed = text.trim();
  return trimmed ? trimmed.replace(/[.!?]*$/, ".") : "";
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

/** What to say when a page stopped part way through. */
export function partialPageMessage(pageNumber: number, retakeable: boolean, appVoice: boolean): string {
  const which = retakeable ? "this page" : `page ${pageNumber}`;
  if (appVoice) {
    return retakeable
      ? `I couldn't read the rest of ${which}. Press Play to hear what I have, or Retake page to photograph it again.`
      : `I couldn't read the rest of ${which}. Press Play to hear what I have.`;
  }
  return retakeable
    ? `I couldn't read the rest of ${which}. The part I read is here. Retake page photographs it again.`
    : `I couldn't read the rest of ${which}. The part I read is here.`;
}

function liveTitleAnnouncement(page: DocPage, meta: MetaEvent): string {
  const title = sentence(meta.title);
  return page.number === 1 ? title || "Reading page 1." : `Page ${page.number}. ${title}`.trim();
}

function cameraMessage(kind: CameraErrorKind): string {
  switch (kind) {
    case "denied":
      return CAMERA_MESSAGES.denied;
    case "in_app_browser":
      return CAMERA_MESSAGES.inAppBrowser;
    case "insecure":
      return CAMERA_MESSAGES.insecure;
    case "no_camera":
      return CAMERA_MESSAGES.noCamera;
    case "busy":
      return CAMERA_MESSAGES.busy;
    case "unknown":
      return CAMERA_MESSAGES.unknown;
  }
}

async function cameraPermissionGranted(): Promise<boolean> {
  try {
    const status = await navigator.permissions?.query({ name: "camera" as PermissionName });
    return status?.state === "granted";
  } catch {
    return false;
  }
}
