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
