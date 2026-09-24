import { CAMERA_MESSAGES, spokenError } from "@/lib/shared/messages";
import type { ErrorCode, MetaEvent } from "@/lib/shared/protocol";
import { Announcer, type AnnounceOptions, type Channel } from "./announce/announcer";
import { LiveRegions } from "./announce/liveRegions";
import { ApiError, createApiClient, type ApiClient } from "./api";
import { Sounds } from "./audio/sounds";
import { CameraError, startCamera, type CameraErrorKind, type CameraHandle } from "./camera/camera";
import { FrameSampler } from "./camera/frameSampler";
import { imageFromFile, prepareImage, type PreparedImage } from "./camera/prepare";
import type { Doc, DocPage } from "./document/model";
import { DocumentSession } from "./document/session";
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
} from "./settings";
import { BrowserSpeechPort, type SpeechPort, type VoiceInfo } from "./speech/port";
import { Reader } from "./speech/reader";
import { Speaker, type Timers } from "./speech/speaker";
import { pickVoice, voicesForLanguage } from "./speech/voices";
import { safeStorage, type StorageLike } from "./storage";
import { Store } from "./store";
import { CuePolicy, FramingTracker, type Situation } from "./vision/framing";
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
  /** Screens move focus when this changes. */
  focus: { target: FocusTarget; seq: number };
}

export const UI_LANG = "en";

export const FIRST_LAUNCH_QUESTION =
  "Document Reader. Do you use VoiceOver? Tap the top half of the screen for yes, or the bottom half for no.";
export const CAMERA_PERMISSION_LINE = "I need the camera to see the page. Tap Allow if your phone asks.";
export const CAMERA_INTRO =
  "Lay the phone flat on the page, then lift it slowly. I'll tell you when I can see the whole page, or press Capture to take the picture yourself.";

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

  private readonly env: ControllerEnv;
  private passcode: string | null;
  private camera: CameraHandle | null = null;
  private cameraWaiters: Array<(camera: CameraHandle | null) => void> = [];
  private videoToken = 0;
  private videoEl: HTMLVideoElement | null = null;
  private loadingTicker: unknown = null;
  private resumeOnReturn = false;
  private pausedByHide = false;
  private cameraIntroPending: "full" | "addPage" | "none" = "full";
  private readonly sampler = new FrameSampler();
  private tracker = new FramingTracker();
  private readonly cuePolicy = new CuePolicy();
  private analysisTimer: unknown = null;
  /** Automatic capture fires at most once per visit to the camera screen (PROMPT.md 6.3). */
  private armed = false;
  private torchTried = false;
  private readonly cleanups: Array<() => void> = [];

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
      focus: { target: "heading", seq: 0 },
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
    if (screen !== "camera" && this.ui.get().screen === "camera") this.ui.update({ capturing: false });
    this.ui.update({ screen, errorText: null, focus: { target: "heading", seq: this.ui.get().focus.seq + 1 } });
    // Keep the screen on while framing a page or listening to one.
    this.env.wakeLock?.setWanted(screen === "camera" || screen === "reading");
  }

  // -------------------------------------------------------------------------
  // Start, mode, passcode
  // -------------------------------------------------------------------------

  /** The Start tap. Unlocks speech and sound (iOS needs a tap first), then continues. */
  start(): void {
    this.sounds.unlock();
    this.env.port.prime();
    if (this.settings.get().mode === null) {
      // First launch: the mode is unknown, so the question is always spoken.
      this.speaker.speak(FIRST_LAUNCH_QUESTION, { priority: "high", lang: UI_LANG });
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

  forgetPasscode(): void {
    this.passcode = null;
    forgetPasscode(this.env.local);
    this.reader.suspend();
    this.navigate("passcode");
    this.say("Passcode forgotten. Enter the passcode, then press Continue.");
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

  private async openCamera(opts: { first?: boolean; addPage?: number | null; intro?: "full" | "addPage" | "none" }): Promise<void> {
    this.ui.update({ addingPage: opts.addPage ?? null, cameraError: null });
    this.cameraIntroPending = opts.intro ?? (opts.addPage ? "addPage" : "full");
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
    this.tracker = new FramingTracker();
    this.cuePolicy.reset();
    this.armed = true;
    this.torchTried = false;
    this.scheduleAnalysis(250);
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
      if (situation.kind === "ready" && this.armed && this.settings.get().autoCapture) {
        void this.autoCapture();
        return;
      }
      this.guide(situation, now);
    }
    this.scheduleAnalysis();
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
    this.ui.update({ capturing: true });
    this.sounds.shutter();
    try {
      const still = await camera.captureStill();
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
    this.tracker.resetSteady();
    this.armed = true;
    this.say(message);
    this.scheduleAnalysis(600);
  }

  private speakCameraIntro(): void {
    const intro = this.cameraIntroPending;
    this.cameraIntroPending = "none";
    if (intro === "full") this.say(CAMERA_INTRO);
    else if (intro === "addPage") {
      this.say(`Page ${this.ui.get().addingPage ?? this.session.nextPageNumber}. Lay the phone flat on the next page, then lift it slowly.`);
    }
  }

  /** The Capture button: takes the picture at once, with no framing checks (principle 4). */
  async captureManual(): Promise<void> {
    if (this.ui.get().capturing) return;
    this.armed = false;
    this.ui.update({ capturing: true });
    const camera = await this.waitForCamera(5000);
    if (!camera) {
      this.ui.update({ capturing: false });
      this.say("The camera isn't working. Press Use phone camera instead.");
      return;
    }
    this.sounds.shutter();
    try {
      const still = await camera.captureStill();
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
    this.ui.update({ capturing: true });
    try {
      const image = await imageFromFile(file);
      await this.processCapture(image.source, image.width, image.height);
    } catch (err) {
      this.ui.update({ capturing: false });
      this.fail("I couldn't open that photo. Please try again.", err instanceof Error ? err.message : undefined);
    }
  }

  private async processCapture(source: CanvasImageSource, width: number, height: number): Promise<void> {
    const image = await prepareImage(source, width, height);
    if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) source.close();
    console.info("captured", { width: image.width, height: image.height, bytes: image.bytes });
    this.say("Got it. Reading.");
    this.ui.update({ capturing: false });
    this.startPageRead(image);
  }

  // -------------------------------------------------------------------------
  // Reading a page
  // -------------------------------------------------------------------------

  private startPageRead(image: PreparedImage): void {
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

    const read = this.session.readPage(image, {
      onRetry: (problem) => {
        this.stopLoadingTicker();
        this.quietReaderAfterFailedCapture(adding);
        this.sounds.error();
        this.say(problem, { alert: true });
        void this.openCamera({ addPage: adding ? pageNumber : null, intro: "none" });
      },
      onPageStart: (page, meta) => {
        this.stopLoadingTicker();
        this.sounds.pageFound();
        this.reader.beginPage(page.number, { title: meta.title, warning: meta.warning, language: meta.language });
        if (!this.appVoiceActive) this.say(liveTitleAnnouncement(page, meta));
      },
      onBlock: (page, index, block) => {
        this.reader.addBlock(page.number, index, block.kind, block.text);
      },
      onPageDone: (page) => {
        this.reader.completePage(page.number);
        this.announcePageDone(page);
      },
      onError: (code, message, page) => {
        this.stopLoadingTicker();
        if (page) {
          this.reader.completePage(page.number);
          this.reader.setLoading(this.session.isReading);
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
        this.fail(message, `Reading failed: ${code}`);
        if (!page) void this.openCamera({ addPage: adding ? pageNumber : null, intro: "none" });
      },
    });
    // The session counts a read as finished only after its stream closes; then the reader knows
    // no more text is coming and can announce the end of the document.
    void read.then(() => this.reader.setLoading(this.session.isReading));
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

  private announcePageDone(page: DocPage): void {
    if (page.blocks.length === 0) {
      this.say("I couldn't find any text on this page. Try again or try another page.");
      return;
    }
    if (this.appVoiceActive) return; // the reader speaks the page itself
    const count = page.blocks.length;
    this.say(`Page ${page.number} ready. ${count} ${count === 1 ? "paragraph" : "paragraphs"}. Swipe right to read.`);
    this.requestFocus("transcript");
  }

  /** In VoiceOver mode nothing speaks while waiting for the first line, so tick instead. */
  private startLoadingTicker(): void {
    this.stopLoadingTicker();
    const tick = () => {
      this.sounds.tick();
      this.loadingTicker = this.env.timers.setTimeout(tick, 2000);
    };
    this.loadingTicker = this.env.timers.setTimeout(tick, 2000);
  }

  private stopLoadingTicker(): void {
    if (this.loadingTicker !== null) {
      this.env.timers.clearTimeout(this.loadingTicker);
      this.loadingTicker = null;
    }
  }

  private restoreDocument(doc: Doc): void {
    this.reader.reset();
    for (const page of doc.pages) {
      this.reader.beginPage(page.number, { title: page.title, warning: page.warning, language: page.language });
      page.blocks.forEach((block, index) => this.reader.addBlock(page.number, index, block.kind, block.text));
      this.reader.completePage(page.number);
    }
    this.navigate("reading");
    this.say(
      this.appVoiceActive
        ? `Your document is still here: ${doc.title} Press Play to hear it, or New document to start again.`
        : `Your document is still here: ${doc.title} Swipe right to read it, or find New document to start again.`,
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
      this.say(delta > 0 ? "That is the fastest speed." : "That is the slowest speed.");
      return;
    }
    this.updateSettings({ rate });
    this.reader.rateChanged();
  }

  /** VoiceOver mode: turn the app's reader on for this document. */
  playWithAppVoice(): void {
    this.ui.update({ docAppVoice: true });
    this.reader.play();
  }

  newDocument(): void {
    this.reader.reset();
    this.session.newDocument();
    this.stopLoadingTicker();
    this.ui.update({ docAppVoice: false, addingPage: null });
    this.say("New document.");
    void this.openCamera({});
  }

  addPage(): void {
    if (this.session.awaitingFirstLine) {
      this.say("Wait a moment, I'm still reading the last page.");
      return;
    }
    this.reader.suspend();
    void this.openCamera({ addPage: this.session.nextPageNumber });
  }

  /** From the camera (while adding a page), Ask, or Settings. */
  backToReading(): void {
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
    else this.say(`${this.reader.positionReport("Paused")} Press Play to continue.`);
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
    this.say(voice ? `Voice: ${voice.name}.` : "Voice: automatic.");
  }

  previewVoice(): void {
    const lang = this.voiceLanguage();
    this.speaker.speak(
      baseLang(lang) === "en" ? "This is how I will read your documents." : "This is how I will read this document.",
      { priority: "high", lang },
    );
  }

  setRate(rate: number): void {
    const next = clampRate(rate);
    if (next === this.settings.get().rate) return;
    this.updateSettings({ rate: next });
    this.say(`Speed ${next.toFixed(1)}.`);
  }

  setAutoCapture(on: boolean): void {
    this.updateSettings({ autoCapture: on });
    this.say(on ? "Automatic capture on." : "Automatic capture off. Press Capture to take each picture.");
  }

  setGuidance(guidance: Settings["guidance"]): void {
    this.updateSettings({ guidance });
    this.say(guidance === "full" ? "Full guidance." : "Minimal guidance. I'll only say hold still.");
  }

  setSounds(on: boolean): void {
    this.updateSettings({ sounds: on });
    this.say(on ? "Sounds on." : "Sounds off.");
    if (on) this.sounds.tick();
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
      this.speaker.cancelAll();
      return;
    }
    if (this.pausedByHide) {
      this.pausedByHide = false;
      this.say("Paused. Press Play to continue.");
    }
    // iOS may end the camera track while the page is hidden; restart it.
    if (this.ui.get().screen === "camera" && this.videoEl && this.camera?.track.readyState === "ended") {
      this.cameraIntroPending = "none";
      void this.attachVideo(this.videoEl);
    }
  }
}

function baseLang(tag: string): string {
  return tag.toLowerCase().split(/[-_]/)[0] ?? tag;
}

function liveTitleAnnouncement(page: DocPage, meta: MetaEvent): string {
  const title = meta.title ? meta.title.replace(/[.!?]*$/, ".") : "";
  const warning = meta.warning ? ` ${meta.warning}` : "";
  return page.number === 1 ? `${title}${warning}`.trim() || "Reading page 1." : `Page ${page.number}. ${title}${warning}`.trim();
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
