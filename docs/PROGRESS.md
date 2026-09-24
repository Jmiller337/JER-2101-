# Progress

One entry per phase: what works, what is stubbed, and what changed from `PROMPT.md` and why.

## Phase 0: scaffold and plan

**Works.** Next.js 16.3 App Router project with TypeScript strict, Tailwind CSS v4, ESLint 9 with the Next.js rules, Vitest, and Playwright 1.56.1 configured for an iPhone viewport in Chromium with a fake camera. `output: "standalone"` so one build runs on Vercel, Fly.io, or any container. `/api/health` exists for the e2e server and container health checks. `CLAUDE.md`, `docs/PLAN.md`, `.env.example`.

**Changed from the prompt.** ESLint 9 and TypeScript 5.9 instead of the newest majors, and Playwright pinned; reasons are in `CLAUDE.md` under Assumptions.

## Phase 1: straight line from capture to speech

**Works.**
- Start screen (unlocks speech and sound inside the tap), first-launch mode question, passcode screen checked against `/api/auth`, camera preview with the manual Capture button, image preparation (2000 px long edge, JPEG 0.85, base64), `/api/read` with the NDJSON protocol, and the reading screen that speaks the page while it streams, with Play and Pause.
- VoiceOver mode: every status message goes to the `role="status"` live region (failures to `role="alert"`), the app voice stays silent, the transcript is plain text with markers written out, and focus moves to the document heading when a page is ready. "Play with app voice" turns the reader on for the current document.
- The model-output parser handles fences, prose, repaired lines, several objects per line, a missing meta line, and the plain-text fallback after 600 characters. It always ends with one `done` or `error`.
- The reader state machine already supports everything Phase 2 needs (navigation, spell, speed, position reports, pages added mid-read); Phase 1 exposes only Play and Pause.
- Streaming was checked through the production server (`next build` + standalone server): events arrive line by line as the model produces them, uncompressed.

**Timing.** With the scripted model the server sends its first event about 160 ms after the request and the phone speaks the title as soon as that event arrives. Real numbers depend on the model's time to first token and could not be measured here because the build environment has no API key; `npm run check:real-api` prints time to the meta line (when the title starts being spoken), time to the first block, total time, tokens, and cost for `tests/fixtures/pages/letter-photo.jpg` or any photo.

**Test fixtures.** `npm run fixtures` renders a realistic utility bill and turns it into a phone-photo-like JPEG (skew, rotation, wooden table, uneven light, noise). No handwriting font is available in the build environment, so handwriting is covered by the manual iPhone checklist instead. The end-to-end tests run the real production server with `FAKE_MODEL=1` (a scripted model with realistic streaming), Chromium's fake camera fed by generated Y4M videos, and a fake `speechSynthesis` that records every utterance.

**Changed from the prompt, and why.**
- The read prompt asks for the title, warning, and problem in English. They are spoken with the English interface voice before the reader switches to the page's language, so a Spanish title would be read with an English voice.
- Error events carry a machine `code` next to the spoken `message`, so the phone can react (for example, go back to the passcode screen on `unauthorized`). The addition is backward compatible.
- Pressing Capture while the camera is still starting waits up to five seconds for it instead of refusing, because a blind user cannot see that the preview is not ready yet.
- `FAKE_MODEL=1` swaps in a scripted model for end-to-end tests. It logs a warning at startup and must never be set on a deployment.

**Not yet.** Full reading controls, the full Settings screen, wake lock, keyboard shortcuts, and axe checks (Phase 2); framing guidance, automatic capture, and the phone-camera fallback button (Phase 3); adding pages and questions (Phase 4).

## Phase 2: full playback and accessibility

**Works.**
- The full read-aloud control bar: Back and Forward (one sentence), Play/Pause, Previous and Next paragraph, Spell, Slower and Faster, New document, Settings. Short visible labels have fuller accessible names that contain the visible text ("Back one sentence").
- Bluetooth keyboard shortcuts on the reading screen: Space, Left/Right, Up/Down. Space on a focused button is left to the button.
- Settings: interface mode, voice (the phone's voices for the document language, best first, novelty voices hidden, with Preview), speed slider plus Slower/Faster, automatic capture switch, full or minimal guidance, sounds switch, and Forget passcode. Every change is announced through the one announcement channel. Values persist in `localStorage`.
- Leaving the reading screen (Settings) pauses silently; coming back resumes with "Resuming." if it was reading, otherwise says the position and "Press Play to continue."
- Screen Wake Lock is held on the camera and reading screens and re-acquired when the page becomes visible again. Hiding the page (screen lock, app switch) pauses the reader; returning says "Paused. Press Play to continue."
- Focus moves to each screen's heading on arrival, to the error text after an error, and to the document heading when a page is ready in VoiceOver mode.
- axe runs on every screen in both modes in the end-to-end tests, with no violations. A layout test checks that the Capture button stays fully visible on small and large iPhone screens.
- `docs/TESTING-ON-IPHONE.md` is started with the playback, settings, sound, lock-screen, and VoiceOver checks.

**Changed from the prompt, and why.**
- Paragraph navigation got its own row with full labels ("Previous paragraph", "Next paragraph") instead of five buttons in one row, which forced abbreviations that read badly in VoiceOver.
- A speed change is announced ("Speed 1.2.") and the current sentence then restarts at the new speed, instead of the new speed starting with the next sentence: announcing the speed already interrupts the sentence, so restarting it is the least surprising behavior.
- After Spell, the reader stays paused on the spelled sentence so it can be spelled again or played; Play then reads it normally and continues.
- The reading screen scrolls as a whole page with a sticky control bar, instead of an inner scrolling box. axe flagged the inner box as unreachable by keyboard, and page-level scrolling also works better with VoiceOver's own scrolling.
- The camera status line may be clipped on short screens so that the Capture button is never pushed off the bottom; everything in it is spoken anyway.

## Phase 3: framing guidance and automatic capture

**Works.**
- Frame analysis at about seven frames a second on a 160-pixel-wide copy of the preview: brightness, glare (blown-out highlights on paper that is not itself blown out), the page region (largest bright blob after Otsu thresholding and erosion, with a text-detail fallback for a white page on a white table, and a check that a frame-filling bright region is a page held too close rather than a light table), steadiness (frame difference), and sharpness (Laplacian variance, calibrated against the best seen this session).
- Cue policy: a situation must hold for two frames, at most one cue per 1.5 seconds, no identical cue within 4 seconds, "Hold still" may skip the spacing, and minimal guidance speaks only the hold-still cues. A cue dropped because something else was speaking is not counted as spoken, so it comes back.
- Automatic capture after 700 ms steady with the whole page in view, sharp, bright enough, and without glare: shutter sound, still capture (`ImageCapture.takePhoto()` when available, otherwise the video frame), a lenient blur check on the still, then "Got it. Reading." A blurry still says "Blurry. Hold still." and re-arms. Automatic capture fires at most once per visit to the camera screen. Manual Capture skips every check.
- With automatic capture off, a ready page gets "I see the whole page. Press Capture."
- The flashlight is turned on once in the dark when the browser reports torch support ("It's dark, so I turned on the light."); otherwise "Too dark. Turn on a light."
- "Use phone camera instead" opens the iPhone camera through a file input; the photo is oriented from its EXIF data and read like any capture. When the live camera fails, it replaces Capture as the big button.
- Camera failures are told apart: permission denied, another app's in-app browser ("Please open this page in Safari."), insecure address, no camera, camera busy.
- End-to-end: Chromium's fake camera plays generated videos. The guidance test checks the spoken order "I can't see a page" (empty table), "Move right." (page cut off on the right), "I see the whole page. Hold still." (shaking), then automatic capture once steady, then the page is read. Separate tests cover minimal guidance, automatic capture off, a dark room, the phone-camera fallback, a refused camera, and an in-app browser.

**Changed from the prompt, and why.**
- Cue wording for a phone held flat over a table. "Move back" and "Move up" or "Move down" are ambiguous when the phone is held flat (back toward you, or up off the table?), so: "Move closer to the page." (too small), "Lift the phone higher." (too close), "Move away from you." and "Move toward you." (cut off at the top or bottom of the phone), and combinations such as "Move right and toward you." Left and right are unchanged.
- "Too small" triggers below 20 percent of the frame instead of about 40 percent. A fully visible letter-sized page covers only about 40 to 55 percent of a portrait frame, so 40 percent would have asked the user to come so close that the page's edges were cut off.
- The blur check on the still compares the center of the still with the preview's best center sharpness at the same small size. The still and the preview can have different fields of view (a 4:3 photo and a 16:9 preview), so comparing the page box would not line up.

**Verify on the device.** The thresholds were tuned on synthetic frames and a generated video. The direction cues, hand-tremor tolerance, and flashlight support need the checks in `docs/TESTING-ON-IPHONE.md` section 2a.

## Phase 4: several pages and questions

**Works.**
- Add page (read-aloud control bar and VoiceOver-mode buttons): the camera opens as "Add page N" with its own short instruction; the new page is read into the same document. If reading had finished, the app says "Page N added." and reads the new page; if it was mid-page, it goes back to where it was and says "Page N." at the boundary. Pages stay in order even if a late block for an earlier page arrives. A retry does not use up the page number, and pressing Add page before the previous page's first line has arrived says "Wait a moment, I'm still reading the last page."
- The document (text only) is kept in `sessionStorage`; after an accidental reload, Start restores it and says "Your document is still here: …".
- `/api/ask` streams an answer about all pages with the transcript in a cached system block and the last ten turns of history. The phone speaks the answer sentence by sentence as it arrives (read-aloud mode) or announces it in one live-region message when complete (VoiceOver mode), then "Ask another question, or press Back to reading." Questions and answers stay on screen as a list.
- Talk uses the browser's speech recognition where it exists; the recognized words appear in the question box as they are heard, and the app confirms "You asked: …" before answering. Where recognition is missing or refused, the app says so and the text box (with the keyboard's dictation key) remains the way in.
- `npm run check:real-api` now also asks two questions about the page it read and prints the cache tokens, so the owner can confirm the prompt cache works on a long document. `FAKE_MODEL=1` runs the script against the scripted model for free.

**Changed from the prompt, and why.**
- "Hold to talk" became a Talk toggle: tap to start, tap "Stop and send" to finish. Holding a button down is awkward with VoiceOver (double-tap and hold), and a toggle works the same for everyone.
- `/api/ask` streams NDJSON (`text`, `done`, `error` events) rather than plain text, so a failure part-way through an answer can be announced properly.
- New document asks for a second press within six seconds when there is a document, so one stray tap cannot throw a document away.
- A spoken question is echoed ("You asked: …") before the answer, so recognition mistakes are caught.

## Phase 5: hardening and handover

**Works.**
- Every failure that can be provoked has one spoken sentence with a next step, and an end-to-end test: no network (one automatic retry first), a passcode changed on the server (back to the passcode screen), a refusal, a photo too large, a photo the model cannot read (retake, page number kept), a server without an API key, a stream cut off mid-page (the text that arrived is kept, reading stops there, and Retake page photographs that page again), a refused camera, another app's in-app browser, and a browser with no speech engine (a visible banner, and everything goes to the live region so VoiceOver can still read it). In VoiceOver mode none of these is ever spoken by the app's own voice.
- Web app manifest with `display: "browser"`, icons, the iOS home-screen title, and the standalone flag turned off (see PROMPT.md 6.12).
- Bundle size: the phone downloads 157 KB of JavaScript (gzipped, 531 KB raw). It was 244 KB until `zod` was removed from the phone's code: the shared protocol now uses small hand-written validators, and `zod` validates request bodies on the server only. An end-to-end test fails if the JavaScript grows past 200 KB gzipped.
- `Dockerfile` (multi-stage, standalone output, non-root user, health check), `.dockerignore`, and `fly.toml` (HTTPS forced, auto stop and start, health check on `/api/health`, 512 MB machine). The image was built and run locally: it serves the app and icons, answers the health check, and streams a page read line by line. It is about 330 MB.
- Returning to a visible page on the camera screen restarts a paused preview (iOS can pause it while the phone is locked).
- Each page keeps the JPEG it was read from in memory for the session (PROMPT.md 6.4 and 6.9), for a future re-read or questions about the image. It is never written to `sessionStorage`.
- `docs/SETUP.md` (Vercel, Fly.io, optional `.dev` domain, iPhone setup, first use, model and cost, privacy, troubleshooting), the finished `docs/TESTING-ON-IPHONE.md`, and a new `README.md`.

**Notes.**
- Docker Hub rate-limited this build environment's anonymous pulls, so the local image test used Google's mirror of the same official Node image (`--build-arg NODE_IMAGE=mirror.gcr.io/library/node:22-alpine`) and the environment's proxy certificate as a build secret. The committed `Dockerfile` is unchanged by either; Fly's builders pull `node:22-alpine` normally.
- Fly.io's documentation was not reachable from the build environment. `fly.toml` and the Fly steps in `docs/SETUP.md` use the standard commands and settings; `docs/SETUP.md` tells the owner to check fly.io/docs if a command fails.

## Fixes from an independent review

A separate review of the finished code found these problems. Each is fixed and, where a browser can show it, covered by a test.

- **Older iPhones.** The build targeted Safari 16.4, so on iOS 16.0 to 16.3 the app would not have started at all. The browser targets now include iOS 16, an end-to-end test fails if the shipped code contains syntax those versions cannot parse, and if the app still cannot start, tapping Start says so aloud.
- **A page cut off part way.** Reading used to carry on to "End of document" and the app sent the user back to the camera. Now reading stops at the gap, the app says "I couldn't read the rest of this page. Press Play to hear what I have, or Retake page to photograph it again.", and Retake page replaces that page with a new photo.
- **Pages in order.** When page 2 arrived before page 1 had finished streaming, the reader could start page 2 early. It now waits at the page boundary until page 1 is complete.
- **Leaving the Ask screen** stops the microphone and any answer still being spoken or streamed. A question sent while the previous one is still being answered is refused with a spoken reason, and the typed question stays in the box.
- **Screen lock during an answer.** The answer is no longer lost: on return the app says "Here is the answer again." and repeats it, or "Still answering." and speaks it when it is complete.
- **Speech recognition.** Results from a cancelled listening session can no longer be sent as a question, and cancelling never sends one.
- **Short notices while reading** ("That is the fastest speed.", the New document confirmation, "Wait a moment…") are said and then the reading carries on, instead of stopping it.
- **Unavailable buttons** (for example Ask a question before a page has been read) now say why when pressed, instead of doing nothing.
- **VoiceOver announcements.** Messages that arrive together are spaced out so VoiceOver hears each one, a repeated message is announced again, and camera cues wait until VoiceOver has had time to read the previous message (the app voice already worked this way). Switches and the speed slider are no longer announced twice: VoiceOver reads their new state itself.
- **Question history** sends the last five questions and answers, each trimmed to the length the server accepts, so one very long answer can no longer make every later question fail.
- **The home-screen icon** explicitly opens the app in Safari, not as a standalone web app.
- **`FAKE_MODEL=1`** is now ignored, with an error in the log, when the server runs on Vercel or Fly.io, so a stray setting can never make a real deployment read out invented text.

## What still needs the owner

1. **An API key in the build environment, or a run of `npm run check:real-api` on your computer.** No Anthropic key was available where the app was built, so it has never read a real photo. Everything up to the model call is tested with a scripted model. The first real run will show the time to first word, the cost per page, and whether the read prompt behaves as expected on real photos (see `docs/SETUP.md` section 5).
2. **Deploying** to Vercel or Fly.io and setting `ANTHROPIC_API_KEY` and `APP_PASSCODE` (`docs/SETUP.md` section 2).
3. **The manual iPhone checklist** (`docs/TESTING-ON-IPHONE.md`) with the user, including the checks that only a real iPhone can answer: that direction cues point the right way, that hand tremor does not block automatic capture, that speech is heard with the silent switch on, the flashlight, the phone call and screen lock behavior, and how VoiceOver reads the transcript.
4. **Choosing the model** after the first real runs: Claude Opus 5.5 is the default; setting `READ_MODEL` and `ASK_MODEL` to `claude-sonnet-5` makes reading faster and cheaper (`docs/SETUP.md` section 5).
5. **Merging or renaming the branch** if you want the code on `main`; the deploy steps work from the current default branch as it is.

## Assumptions made while building

Each can be changed; the reason is given.

- **Cue wording** for a phone held flat over a table ("Move away from you", "Lift the phone higher", "Move closer to the page"), because "Move back" and "Move up" are ambiguous in that position (Phase 3).
- **Framing thresholds** in `FRAMING` (`src/lib/client/vision/framing.ts`) were tuned on synthetic frames and a generated video. "Too small" is below 20 percent of the frame, not 40, because a fully visible letter-sized page covers only 40 to 55 percent of a portrait frame (Phase 3).
- **The title, warning, and problem are written in English** by the model even for a page in another language, because they are spoken with the English interface voice (Phase 1).
- **A speed change restarts the current sentence** at the new speed after announcing it; **Spell** leaves the reader paused on the spelled sentence (Phase 2).
- **Talk is a toggle** (tap to start, tap "Stop and send") rather than hold-to-talk, which is awkward with VoiceOver (Phase 4).
- **New document needs a second press** within six seconds when there is a document (Phase 4).
- **Leaving the reading screen** for Settings or Ask pauses silently and resumes on return if it was reading; Add page continues reading page 1 after the capture (Phases 2 and 4).
- **`/api/ask` streams NDJSON** instead of plain text so an error part-way through can be announced (Phase 4).
- **Automatic capture fires at most once per visit** to the camera screen and re-arms after a blurry still, a retake, a failed capture, Add page, and New document (Phase 3).
- **Minimum iOS 16**, as the spec says. The build avoids syntax that iOS 16.0 to 16.3 cannot parse and a test checks for it. Tailwind CSS v4 officially targets Safari 16.4; its newer CSS features have fallbacks, but the look on iOS 16.0 to 16.3 has not been seen on a device.
- **Toolchain:** ESLint 9 and TypeScript 5.9 (the newest majors break Next.js's lint plugins), Playwright pinned to 1.56.1 to match the preinstalled browser (Phase 0).
- **`FAKE_MODEL=1`** exists for tests and dry runs. It is ignored on Vercel and Fly.io, and the server logs a warning whenever it is used.
