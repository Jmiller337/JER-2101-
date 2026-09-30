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
  clampPitch,
  clampRate,
  clampVolume,
  forgetPasscode,
  loadPasscode,
  loadSettings,
  RATE_STEP,
  savePasscode,
  saveSettings,
  TALK_LEARNED_AFTER,
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
import { FRAMING, CuePolicy, FramingSounds, FramingTracker, type Situation } from "./vision/framing";
import { CAMERA_MODE_LINES, MODES_HINT, modeAfterSwipe, type CameraMode, type SwipeDirection } from "./cameraModes";
import {
  echoQuestion,
  HELP_LINE,
  interpret,
  NO_MICROPHONE,
  NO_RECOGNITION,
  NOTHING_HEARD,
  unknownLine,
  type Command,
} from "./voice/commands";
import { HOLD } from "./voice/hold";
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
  /** What the user asked for before the next photo ("the amount due"); sent with it. */
  pendingQuestion: string | null;
  /** Listening after a hold (or the camera's Talk button in VoiceOver mode). */
  talking: boolean;
  /** What has been heard so far while talking, shown on screen. */
  heard: string;
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
/** Said after "Camera ready." until the user has talked to the app a few times (TALK_LEARNED_AFTER). */
export const TALK_HINT = "Hold the screen and tell me what you want to know, or just take the picture.";
/**
 * Said on first use and from Settings (docs/PROMPT-2.md section 5). It speaks only for this app
 * and its server; the owner adds a sentence about the reading service after checking its policy.
 */
export const PRIVACY_STATEMENT =
  "This app saves nothing. Your photo is sent once to be read, then deleted from the phone. The words are kept only until you start a new document or close the app. Nothing is stored on the server.";
/** After the answer to a question asked before the photo (docs/PROMPT-2.md section 3). */
export const FOLLOW_UP_ANSWERED = "Hold the screen to ask something else, or press Play to hear everything.";
/** After an answer that says the thing asked for is not on the photographed page. */
export const FOLLOW_UP_NOT_FOUND = "Try the other side of the page, or press Play to hear everything.";
/** After saying what the document is, when nothing was asked. */
export const FOLLOW_UP_OVERVIEW = "What do you want to know? Hold the screen to ask, or press Play to hear everything.";
/** Said once when an answer has not started within LET_ME_LOOK_MS (principle 6). */
export const LET_ME_LOOK = "Let me look.";
const LET_ME_LOOK_MS = 1500;
/** Lines that "what did you say" skips: it repeats what came before them. */
const NOT_REPEATED = new Set([FOLLOW_UP_ANSWERED, FOLLOW_UP_NOT_FOUND, FOLLOW_UP_OVERVIEW, ASK_AGAIN, LET_ME_LOOK, NOTHING_HEARD]);

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
  /** The last answer given, for "what did you say". */
  private lastAnswer: string | null = null;
  private askAbort: AbortController | null = null;
  private readonly listener = new Listener();
  private nextTurnId = 1;
  private newDocumentArmedUntil = 0;
  /** The page being retaken (its partial text is replaced when the new photo is captured). */
  private retakeTarget: number | null = null;
  /** An answer interrupted by the page being hidden is spoken again on return. */
  private answerReplay: "none" | "onReturn" | "whenDone" = "none";
  private readonly tickers = new Map<string, unknown>();
  /** Talking: "stopping" after the finger lifts, until the last words have been recognized. */
  private talkState: "idle" | "listening" | "stopping" = "idle";
  private talkTimer: unknown = null;
  /** The reader was reading when the hold began (it pauses while the microphone listens). */
  private talkWasReading = false;
  /** "This phone can't hear me" is said once per session. */
  private noRecognitionSaid = false;
  /** The last thing said to the user, for "what did you say". */
  private lastSaid: string | null = null;
  /** A question asked while a page was still arriving: answered once all of it is here. */
  private queuedQuestion: string | null = null;
  private readonly framingSounds = new FramingSounds();

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
      pendingQuestion: null,
      talking: false,
      heard: "",
      focus: { target: "heading", seq: 0 },
      speechUnavailable: false,
    });
    this.speaker = new Speaker({
      port: env.port,
      timers: env.timers,
      defaultLang: UI_LANG,
      defaultRate: () => this.settings.get().rate,
      pitch: () => this.settings.get().pitch,
      volume: () => this.settings.get().volume,
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
    const said = this.announcer.say(text, opts);
    if (said && !NOT_REPEATED.has(text)) this.lastSaid = text.trim();
    return said;
  }

  private fail(message: string, detail?: string): void {
    this.sounds.error();
    this.ui.update({ errorText: detail ?? null });
    this.say(message, { alert: true });
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
    if (screen !== from) this.dropTalk();
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
      mode === "voiceOver" ? "VoiceOver mode. I'll stay quiet and let VoiceOver speak." : "Read-aloud mode. I'll speak to you.",
    );
    // First use: say once what happens to her photos and documents.
    this.say(PRIVACY_STATEMENT);
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
    this.framingSounds.reset();
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
    // No picture while the user is talking: the question must go with it.
    if (this.ui.get().capturing || this.talkState !== "idle" || document.visibilityState !== "visible") {
      this.scheduleAnalysis();
      return;
    }
    const video = camera.video;
    const frame = this.sampler.sample(video, video.videoWidth, video.videoHeight);
    if (frame) {
      const now = this.now();
      const situation = this.tracker.update(frame, now);
      const sound = this.framingSounds.next(situation, this.tracker.lastAnalysis?.page.coverage ?? 0, now);
      if (sound === "chime") this.sounds.framed();
      else if (sound === "tick") this.sounds.framingTick();
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
    // Until the user has talked to the app a few times and changed mode once, the app voice
    // mentions holding the screen and the swipe. (VoiceOver users can do neither here: VoiceOver
    // takes the gestures. They have the Talk button and find the modes as tabs.)
    const speech = this.channel() === "speech";
    const settings = this.settings.get();
    const lines = [CAMERA_INTRO];
    if (speech && this.holdToTalk && settings.talkUses < TALK_LEARNED_AFTER) lines.push(TALK_HINT);
    if (speech && !settings.modesLearned) lines.push(MODES_HINT);
    if (intro === "full") this.say(lines.join(" "));
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
    this.say(gotItLine(this.ui.get().pendingQuestion));
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
    const asked = this.ui.get().pendingQuestion;
    this.say(asked ? gotItLine(asked) : "Got it. Reading the PDF.");
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
    // Answer first (docs/PROMPT-2.md section 3): nothing is read aloud until the answer, or what
    // the document is, has been said, and the whole text only when the user presses Play. Soft
    // ticks fill the wait.
    this.stopAnswer();
    this.startLoadingTicker();

    const isPdf = "pdf" in source;
    const question = this.ui.get().pendingQuestion;
    const callbacks = this.pageReadCallbacks(adding, pageNumber, isPdf, question);
    const read = (
      isPdf ? this.session.readPdf(source.pdf, callbacks, question) : this.session.readPage(source.image, callbacks, question)
    ).then(
      (outcome) => {
        // A PDF read to the end in VoiceOver mode: say once that every page is there.
        const pages = this.session.doc?.pages.filter((p) => p.fromPdf && p.number >= pageNumber).length ?? 0;
        if (isPdf && outcome === "ok" && pages > 1 && !this.appVoiceActive) this.say(`All ${pages} pages are ready.`);
      },
    );
    // The session counts a read as finished only after its stream closes; then the reader knows
    // no more text is coming and can announce the end of the document, and a question asked
    // while the page was arriving can be answered from all of it.
    void read.then(() => {
      this.reader.setLoading(this.session.isReading);
      const queued = this.queuedQuestion;
      if (queued && !this.session.isReading) {
        this.queuedQuestion = null;
        this.stopTicker("answer");
        if (this.session.doc?.pages.length) this.askAboutDocument(queued, { looked: true });
      }
    });
  }

  /** What happens as a page read (or a PDF read, page by page) streams in. */
  private pageReadCallbacks(adding: boolean, pageNumber: number, isPdf: boolean, question: string | null): PageReadCallbacks {
    // The answer (or what the document is) is said once, for the first page of this read.
    let answered = false;
    let firstMeta: MetaEvent | null = null;
    const answeredNow = () => {
      if (answered) return false;
      answered = true;
      this.stopLoadingTicker();
      return true;
    };
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
        this.sounds.pageFound();
        this.reader.beginPage(page.number, { title: meta.title, language: meta.language });
        if (adding && page.number === pageNumber) this.reader.queueAddedPage(page.number);
        if (page.number === pageNumber) {
          firstMeta = meta;
          // The question has been sent with a photo that could be read: it is used up.
          if (question) this.ui.update({ pendingQuestion: null });
        }
      },
      onAnswer: (page, text) => {
        if (page.number !== pageNumber || !answeredNow()) return;
        this.speakAnswer(text, question, isPdf);
      },
      onBlock: (page, index, block) => {
        // The model left out the answer line: in VoiceOver mode say what the page is, as before,
        // as soon as its text starts.
        if (page.number === pageNumber && !this.appVoiceActive && firstMeta && answeredNow()) {
          this.say(liveTitleAnnouncement(page, firstMeta));
        }
        this.reader.addBlock(page.number, index, block.kind, block.text);
      },
      onPageDone: (page) => {
        this.reader.completePage(page.number);
        if (page.number === pageNumber && answeredNow()) this.answerFallback(page, question);
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
   * The short answer before the text: to the question asked before the photo, or, with none, what
   * the document is. Said once, then the app waits: the whole text only when the user asks.
   */
  private speakAnswer(text: string, question: string | null, isPdf: boolean): void {
    if (question) this.recordAnswer(question, text);
    this.lastAnswer = text;
    this.lastSaid = text;
    if (!this.appVoiceActive) {
      // VoiceOver reads the text as written; "Page 1 ready." follows when the page is complete.
      this.say(text);
      return;
    }
    this.stopAnswer();
    // Not on a photographed page: it may be on the back (a PDF has all its pages already).
    const notFound = question !== null && !isPdf && /^I can't find\b/.test(text);
    const followUp = !question ? FOLLOW_UP_OVERVIEW : notFound ? FOLLOW_UP_NOT_FOUND : FOLLOW_UP_ANSWERED;
    const speech = new StreamingSpeech(this.speaker, {
      lang: UI_LANG,
      rate: () => this.settings.get().rate,
      onDone: () => {
        if (this.answerSpeech === speech) this.say(followUp);
      },
    });
    this.answerSpeech = speech;
    speech.push(text);
    speech.finish();
  }

  /**
   * The model left out the answer line. A question is answered from the page's text instead;
   * otherwise the title says what the document is.
   */
  private answerFallback(page: DocPage, question: string | null): void {
    if (question && page.blocks.length > 0) {
      this.askAboutDocument(question);
      return;
    }
    const title = sentence(page.title);
    if (!title || page.blocks.length === 0) return; // "I couldn't find any text" is said instead
    if (this.appVoiceActive) this.say(`${title} ${FOLLOW_UP_OVERVIEW}`);
    else this.say(title);
  }

  /** Keeps an answer given at capture with the questions, so follow-up questions have context. */
  private recordAnswer(question: string, answer: string): void {
    const turn: AskTurn = { id: this.nextTurnId++, question, answer, status: "done" };
    this.ask.update({ turns: [...this.ask.get().turns, turn] });
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
        ? `Your document is still here: ${title} Press Play to hear it, hold the screen to ask about it, or press New document to start again.`
        : `Your document is still here: ${title} Swipe right to read it, or find New document to start again.`,
    );
  }

  // -------------------------------------------------------------------------
  // Reading controls
  // -------------------------------------------------------------------------

  togglePlay(): void {
    // Play stops the answer (and its follow-up line) and starts the full text.
    if (!this.reader.isActive) {
      this.stopAnswer();
      this.speaker.cancelAll();
    }
    this.reader.toggle();
  }

  /** "Read everything": the whole document from its first line. */
  readEverything(opts: { echo?: string } = {}): void {
    if (!this.session.doc?.pages.length) {
      this.say(this.nothingToReadLine());
      return;
    }
    this.stopAnswer();
    this.speaker.cancelAll();
    if (this.ui.get().screen !== "reading") this.backToReading({ quiet: true });
    if (opts.echo) this.say(opts.echo);
    this.reader.readFromStart();
  }

  private nothingToReadLine(): string {
    return this.session.awaitingFirstLine ? "Wait a moment, I'm still reading the page." : "There's nothing to read yet. Take a picture first.";
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
   * six seconds clears it, so a stray tap never throws a document away. Saying "new document" is
   * never a stray tap, so it clears at once (`confirmed`).
   */
  newDocument(opts: { confirmed?: boolean } = {}): void {
    const hasDoc = (this.session.doc?.pages.length ?? 0) > 0;
    const now = this.now();
    if (hasDoc && !opts.confirmed && now > this.newDocumentArmedUntil) {
      this.newDocumentArmedUntil = now + 6000;
      this.notify("Press New document again to clear this document and start a new one.");
      return;
    }
    this.newDocumentArmedUntil = 0;
    this.retakeTarget = null;
    this.autoRetries = 0;
    this.teardownAsk();
    this.ask.update({ turns: [], busy: false });
    this.ui.update({ pendingQuestion: null });
    this.lastAnswer = null;
    this.queuedQuestion = null;
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
  backToReading(opts: { quiet?: boolean } = {}): void {
    this.retakeTarget = null;
    this.ui.update({ addingPage: null });
    this.navigate("reading");
    if (opts.quiet) this.resumeOnReturn = false;
    else this.afterReturnToReading();
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
  submitQuestion(
    input: string,
    opts: { spoken?: boolean; echoed?: boolean; followUp?: string; looked?: boolean } = {},
  ): boolean {
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
    void this.runQuestion(question, doc, passcode, {
      spoken: opts.spoken === true && !opts.echoed,
      followUp: opts.followUp ?? ASK_AGAIN,
      looked: opts.looked === true,
    });
    return true;
  }

  /**
   * A question held and spoken on the reading screen (or the answer the model left out at
   * capture): answered from the whole document, then FOLLOW_UP_ANSWERED.
   */
  askAboutDocument(question: string, opts: { looked?: boolean } = {}): void {
    if (this.session.isReading) {
      // The page is still arriving: answer from all of it once it is here (see startPageRead).
      this.queuedQuestion = question;
      this.startTicker("answer");
      this.env.timers.setTimeout(() => {
        if (this.queuedQuestion === question) this.say(LET_ME_LOOK);
      }, LET_ME_LOOK_MS);
      return;
    }
    this.submitQuestion(question, {
      spoken: true,
      echoed: true,
      followUp: this.appVoiceActive ? FOLLOW_UP_ANSWERED : "",
      looked: opts.looked,
    });
  }

  private async runQuestion(
    question: string,
    doc: Doc,
    passcode: string,
    { spoken, followUp, looked }: { spoken: boolean; followUp: string; looked: boolean },
  ): Promise<void> {
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
          onDone: () => {
            if (followUp) this.say(followUp);
          },
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
    // A careful answer can take a moment: say so rather than stay silent (once per question).
    let started = false;
    const letMeLook = this.env.timers.setTimeout(() => {
      if (!started && !looked && this.askAbort === abort) this.say(LET_ME_LOOK);
    }, LET_ME_LOOK_MS);
    try {
      await this.env.api.ask(
        { pages: docToAskPages(doc), title: doc.title, history, question },
        passcode,
        (event) => {
          if (abort.signal.aborted) return;
          if (event.type === "text") {
            started = true;
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
              this.say(`Answer: ${turn.answer.trim()} ${followUp}`.trim());
            }
            this.lastAnswer = turn.answer.trim();
            this.lastSaid = this.lastAnswer;
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
      this.env.timers.clearTimeout(letMeLook);
      if (this.askAbort === abort) {
        this.stopTicker("answer");
        this.askAbort = null;
        this.ask.update({ busy: false });
      }
    }
  }

  /** The Talk button: starts listening, or stops and sends what was heard. */
  toggleListening(): void {
    this.dropTalk();
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
  // Hold to talk (docs/PROMPT-2.md section 4)
  // -------------------------------------------------------------------------

  /** Holding the screen to talk is for read-aloud mode: VoiceOver takes touches for itself. */
  get holdToTalk(): boolean {
    return this.settings.get().mode === "readAloud";
  }

  /**
   * A hold has lasted 400 ms, or the camera's Talk button was pressed: stop speaking, play the
   * rising tone, and listen. Returns false when listening could not start (and says why).
   */
  startTalk(): boolean {
    if (this.talkState !== "idle") return true;
    if (!recognitionAvailable()) {
      if (!this.noRecognitionSaid) {
        this.noRecognitionSaid = true;
        this.say(NO_RECOGNITION);
      }
      return false;
    }
    // The app must not talk while the microphone listens: whatever it was saying stops, and an
    // answer still arriving is dropped (the user is about to ask something else).
    this.talkWasReading = this.reader.isActive;
    if (this.talkWasReading) this.reader.pause({ silent: true });
    if (this.askAbort) this.teardownAsk();
    this.stopListening(true);
    this.stopAnswer();
    this.speaker.cancelAll();
    const lang = this.voiceLanguage().startsWith("en") ? "en-US" : this.voiceLanguage();
    const started = this.listener.start(lang, {
      onText: (text) => this.ui.update({ heard: text }),
      onEnd: (text, error) => this.talkEnded(text, error),
    });
    if (!started) {
      this.say(NO_MICROPHONE);
      return false;
    }
    this.talkState = "listening";
    this.ui.update({ talking: true, heard: "" });
    this.sounds.listenStart();
    // The hold gesture stops after 8 seconds by itself; this covers the Talk button too.
    this.talkTimer = this.env.timers.setTimeout(() => this.endTalk(), HOLD.maxMs);
    return true;
  }

  /** The finger lifted (or time ran out): the falling tone, then what was heard is acted on. */
  endTalk(): void {
    if (this.talkState !== "listening") return;
    this.talkState = "stopping";
    this.clearTalkTimer();
    this.sounds.listenEnd();
    this.listener.stop();
  }

  /** The finger slid away: what was heard is dropped. */
  cancelTalk(): void {
    if (this.talkState === "idle") return;
    const wasReading = this.talkWasReading;
    this.dropTalk();
    this.sounds.listenEnd();
    // Reading carries on as if nothing happened; otherwise say that nothing will happen.
    if (wasReading && this.ui.get().screen === "reading") this.reader.resume();
    else this.say("Cancelled.");
  }

  /** The camera's Talk button in VoiceOver mode: press to talk, press again when done. */
  toggleTalk(): void {
    if (this.talkState === "listening") this.endTalk();
    else if (this.talkState === "idle") this.startTalk();
  }

  /** Stops listening without a word (leaving the screen, or the Ask screen's Talk button). */
  private dropTalk(): void {
    if (this.talkState === "idle") return;
    this.talkState = "idle";
    this.talkWasReading = false;
    this.clearTalkTimer();
    this.listener.abort();
    this.ui.update({ talking: false, heard: "" });
  }

  private clearTalkTimer(): void {
    if (this.talkTimer !== null) {
      this.env.timers.clearTimeout(this.talkTimer);
      this.talkTimer = null;
    }
  }

  private talkEnded(text: string, error: string | null): void {
    const wasReading = this.talkWasReading;
    this.talkState = "idle";
    this.talkWasReading = false;
    this.clearTalkTimer();
    this.ui.update({ talking: false, heard: "" });
    if (!text) {
      this.say(error === "not-allowed" || error === "service-not-allowed" ? NO_MICROPHONE : NOTHING_HEARD);
      return;
    }
    const uses = this.settings.get().talkUses;
    if (uses < TALK_LEARNED_AFTER) this.updateSettings({ talkUses: uses + 1 });
    const heard = interpret(text);
    if (heard.kind === "command") this.runCommand(heard.command, wasReading);
    else if (heard.kind === "unknown") this.say(unknownLine(text));
    else this.askBySpeech(heard.text);
  }

  /**
   * Something to find on the page. On the camera it is kept for the next photo and said back in
   * a few words ("Amount due."); on the reading and Ask screens it is answered from the document.
   */
  private askBySpeech(question: string): void {
    const screen = this.ui.get().screen === "settings" ? this.leaveSettingsQuietly() : this.ui.get().screen;
    const echo = echoQuestion(question);
    if (screen === "camera") {
      this.ui.update({ pendingQuestion: question });
      this.say(echo);
      return;
    }
    if (!this.session.doc?.pages.length) {
      this.say(
        this.session.awaitingFirstLine
          ? "Wait a moment, I'm still reading the page. Then ask again."
          : "Read a page first, then you can ask about it.",
      );
      return;
    }
    this.say(echo);
    if (screen === "ask") this.submitQuestion(question, { spoken: true, echoed: true });
    else this.askAboutDocument(question);
  }

  /** Back to the screen Settings was opened from, without the usual "Back to reading" line. */
  private leaveSettingsQuietly(): Screen {
    const to = this.ui.get().returnTo;
    this.navigate(to);
    this.resumeOnReturn = false;
    if (to === "camera") this.cameraIntroPending = "none";
    return to;
  }

  private runCommand(command: Command, wasReading: boolean): void {
    switch (command) {
      case "help":
        this.say(HELP_LINE);
        return;
      case "repeat":
        // While reading, the sentence the hold interrupted is read again.
        if (wasReading) this.reader.resume();
        else this.say(this.lastSaid ?? "I haven't said anything yet.");
        return;
      case "settings":
        this.say("Settings.");
        this.openSettings();
        return;
      case "newDocument":
        this.newDocument({ confirmed: true });
        return;
      case "addPage":
        this.addPage();
        return;
      case "capture":
        this.captureBySpeech();
        return;
      default:
        break;
    }
    // The rest work the reader, on the reading screen.
    if (!this.session.doc?.pages.length) {
      this.say(this.nothingToReadLine());
      return;
    }
    if (command === "readEverything") {
      this.readEverything({ echo: "Reading everything." });
      return;
    }
    if (this.ui.get().screen !== "reading") this.backToReading({ quiet: true });
    switch (command) {
      case "play":
        if (!this.reader.isActive) this.togglePlay();
        return;
      case "pause":
        // The hold has already paused the reading.
        this.say(wasReading ? this.reader.positionReport("Paused") : "Stopped.");
        return;
      case "next":
        this.forward();
        return;
      case "back":
        this.back();
        return;
      case "nextParagraph":
        this.nextParagraph();
        return;
      case "previousParagraph":
        this.previousParagraph();
        return;
      case "spell":
        this.spell();
        return;
      case "faster":
      case "slower":
        this.changeRate(command === "faster" ? RATE_STEP : -RATE_STEP);
        // Reading carries on at the new speed after it is said.
        if (wasReading) this.reader.play();
        return;
    }
  }

  /** "Take a picture": the Capture button, on the camera. */
  private captureBySpeech(): void {
    const ui = this.ui.get();
    if (ui.screen !== "camera") {
      this.say("To take a picture, say new document, or add a page.");
      return;
    }
    if (ui.cameraMode !== "camera") {
      this.ui.update({ cameraMode: "camera" });
      if (this.camera) this.startGuidance();
    }
    void this.captureManual();
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
    next.pitch = clampPitch(next.pitch);
    next.volume = clampVolume(next.volume);
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
        : "Read-aloud mode. I'll speak to you.",
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

  /** Tone is the voice's pitch, 0.8 to 1.2 (docs/PROMPT-2.md section 6). */
  setPitch(pitch: number, source: "slider" | "button" = "slider"): void {
    const next = clampPitch(pitch);
    if (next === this.settings.get().pitch) return;
    this.updateSettings({ pitch: next });
    const text = `Tone ${next.toFixed(1)}.`;
    if (source === "slider") this.sayUnlessVoiceOver(text);
    else this.say(text);
  }

  /** Volume 0.5 to 1.0, said as "Volume 5." to "Volume 10.". The phone's buttons still work. */
  setVolume(volume: number, source: "slider" | "button" = "slider"): void {
    const next = clampVolume(volume);
    if (next === this.settings.get().volume) return;
    this.updateSettings({ volume: next });
    const text = `Volume ${Math.round(next * 10)}.`;
    if (source === "slider") this.sayUnlessVoiceOver(text);
    else this.say(text);
  }

  /** The Privacy row in Settings. VoiceOver reads the row's text itself. */
  sayPrivacy(): void {
    this.sayUnlessVoiceOver(PRIVACY_STATEMENT);
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

/**
 * Said with the shutter: "Got it. Looking for the amount due." when something was asked before
 * the photo, "Got it. Reading." when not. A question worded as a question is not repeated.
 */
export function gotItLine(question: string | null): string {
  if (!question) return "Got it. Reading.";
  const asked = question.trim().replace(/[?.!]+$/, "");
  if (/^(what|what's|whats|when|who|whose|how|where|which|why|is|are|does|do|did|can|could|should|was|were|will|tell)\b/i.test(asked)) {
    return "Got it. Looking for the answer.";
  }
  return `Got it. Looking for ${asked}.`;
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
