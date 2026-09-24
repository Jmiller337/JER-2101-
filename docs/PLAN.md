# Build plan

This is the module breakdown and build order for the app specified in `PROMPT.md`. Progress against it is recorded in `docs/PROGRESS.md`.

## Runtime shape

One Next.js page renders a client-side app shell. A single `AppController` (created once in the browser) owns every long-lived object: settings, the speech engine, the reader, the announcer, sounds, the camera, and the current document session. Screens are React components that subscribe to small stores exposed by the controller and call its methods. Navigation is controller state, not URL routes, so the camera stream, the speech queue, and an in-flight read survive screen changes.

The server has three routes (`/api/auth`, `/api/read`, `/api/ask`) plus `/api/health`. Each route file is a one-line wrapper around a handler in `src/lib/server` that takes its dependencies (environment, Anthropic client) as arguments, so route tests run the real handler against a fake model stream.

## Modules

### Shared (`src/lib/shared`)
- `protocol.ts`: zod schemas for the read and ask request bodies and for every streamed event (`meta`, `block`, `done`, `error`, `text`). Error events carry a machine `code` next to the spoken `message`.
- `ndjson.ts`: incremental line splitter used by the server parser and the browser client.
- `messages.ts`: every spoken error sentence in one place.

### Server (`src/lib/server`)
- `config.ts`: environment (`APP_PASSCODE`, `ANTHROPIC_API_KEY`), model constants `READ_MODEL` and `ASK_MODEL` (overridable by environment variables of the same name), limits.
- `auth.ts`: bearer extraction, constant-time passcode comparison, `Origin` check.
- `body.ts`: JSON body reader with a byte cap.
- `prompts.ts`: the read and ask system prompts from `PROMPT.md` sections 6.5 and 6.6.
- `modelOutput.ts`: turns the model's streamed text into validated events. Modes: detect, NDJSON, plain-text fallback. Strips code fences, repairs or drops bad lines, synthesizes `meta` when needed, and always ends with exactly one `done` or `error`.
- `anthropic.ts`: client construction and the narrow `ModelClient` interface the handlers depend on.
- `errors.ts`: maps SDK errors and refusals to `{ code, message }`.
- `readHandler.ts`, `askHandler.ts`, `authHandler.ts`: request validation, the streaming call, NDJSON response, one log line per request.

### Browser (`src/lib/client`)
- `store.ts`: a minimal observable store for `useSyncExternalStore`.
- `settings.ts`, `passcode.ts`: `localStorage` persistence with safe fallbacks.
- `api.ts`: `auth`, `readPage` (streaming NDJSON), `ask` (streaming), with one automatic retry for network failures and typed client errors.
- `text/`: sentence splitting (`Intl.Segmenter` plus abbreviation merging and a 200-character cap), marker normalization for speech, spelling.
- `speech/port.ts`: the `SpeechPort` interface and the browser implementation over `speechSynthesis` (voice loading, cancel-then-speak delay, utterance retention).
- `speech/voices.ts`: voice choice by language, preferring Enhanced or Premium voices and skipping novelty voices.
- `speech/speaker.ts`: single owner of the speech port. Priorities: `high` announcements preempt everything, `content` (the reader) waits behind announcements, `low` (camera cues) is dropped when anything else is speaking. Per-utterance watchdog.
- `speech/reader.ts`: the reading state machine: items (title, warnings, page starts, sentence chunks), play, pause with position report, resume, sentence and paragraph navigation, spell, speed, waiting ticks, end of document, pages appended while playing or after the end.
- `speech/streamingSpeech.ts`: speaks a streamed answer sentence by sentence.
- `announce/`: live-region controller (status and alert regions) and the `Announcer` that routes each message to speech or to the live region according to the mode.
- `audio/sounds.ts`: Web Audio tones (shutter, tick, error, page found).
- `camera/`: `getUserMedia` start and stop, still capture (`ImageCapture.takePhoto` with a canvas fallback), torch, in-app browser detection, image preparation (2000 px long edge, JPEG 0.85, base64), frame sampling for analysis.
- `vision/`: pure frame analysis (luma, brightness, glare, page region with a bright-region strategy and an edge-density fallback, steadiness, sharpness), situation classification, cue wording, cue policy (hysteresis, 1.5 s spacing, 4 s repeat suppression, minimal mode), auto-capture readiness.
- `document/`: the document model, plain-text export for questions, `sessionStorage` persistence, and `DocumentSession`, which runs a page read and feeds the reader and the transcript.
- `wakeLock.ts`: screen wake lock with re-acquire on visibility change.
- `controller.ts`: wiring, navigation, and the flows (start, mode choice, passcode, camera, capture, reading, add page, ask, settings).

### React (`src/components`)
- `AppShell`, `LiveRegions`, shared button components.
- Screens: Start, Mode, Passcode, Camera, Reading (with `Transcript` and `ReaderControls`), Ask, Settings.

## Build order

The phases follow `PROMPT.md` section 9. Each ends with lint, typecheck, unit tests, and build passing, a commit, and a `docs/PROGRESS.md` entry.

1. **Phase 0.** Scaffold, tooling, this plan, `CLAUDE.md`, `.env.example`.
2. **Phase 1.** Shared protocol and NDJSON; server auth, body, prompts, model-output parser, read handler; browser settings, API client, text utilities, speech port, speaker, a first reader with play and pause, announcer and live regions, camera with manual capture, image preparation; Start, Mode, Passcode, Camera, and Reading screens. Test page fixture and route tests.
3. **Phase 2.** Full reader (navigation, spell, speed, watchdog, voices), Settings screen, both announcement modes end to end, focus management, keyboard shortcuts, wake lock, "Play with app voice", axe checks, first draft of the iPhone checklist.
4. **Phase 3.** Frame analysis and tests on synthetic frames, cue policy, auto-capture, torch, `ImageCapture`, file-input fallback, in-app browser detection, the fake camera video, and the Playwright guidance test.
5. **Phase 4.** Add page, page boundaries, `sessionStorage`, ask handler with prompt caching, Ask screen with speech recognition.
6. **Phase 5.** Error mapping for every provocable failure, icons and manifest, bundle size, Dockerfile and `fly.toml`, `SETUP.md`, the full iPhone checklist, final progress report.
