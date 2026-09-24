# Build prompt: a document reader for a blind iPhone user

**How to use this file.** Open Claude Code in a checkout of this repository and paste everything below the line as the first message. The repository is otherwise empty. The owner's answers to the design questions are already folded in, so the builder should not need to ask anything before starting.

---

You are building a mobile web application that lets a blind person read paper documents with their iPhone. They hold the phone over a page, the app guides them by voice until the whole page is in view, takes the photo itself, sends it to Claude to read, and reads the text aloud with playback controls. They can add more pages and ask questions about the document.

Work through the build plan in section 9 autonomously. Do not stop to ask about anything decided in this document. When something is genuinely undecided, make the choice a careful engineer would make, record it in `CLAUDE.md` under "Assumptions", and keep going. Finish the whole plan, not just the early phases.

## 1. Who this is for

- **One specific person**, blind, using an iPhone. Model and iOS version are unknown: assume iOS 16 or newer, keep the real-time image analysis light, and always offer a manual capture button.
- **They may or may not use VoiceOver**, so the app has two modes, chosen on first launch and changeable in Settings:
  - **Read-aloud mode** (VoiceOver off): the app is fully self-voicing. Every state change is spoken by the app. Single taps on big buttons work.
  - **VoiceOver mode** (VoiceOver on): the app is a well-behaved accessible web page. Every control is a real button with a label, the transcript is navigable by heading and paragraph, status goes to a live region, and the app's own voice stays silent unless the user turns it on for a document.
- **No accounts, no multi-user features.** The app is protected by one passcode so a stranger who finds the URL cannot run up the API bill.
- **Documents:** printed mail, bills, letters, forms, receipts, and handwritten notes, often several pages. English first. If a page is in another language, read it in that language with a matching voice when the phone has one.
- The **owner** of this project is sighted, will deploy the app, and will help with the first setup. They are not a professional developer, so the setup guide you write at the end must be step by step.

## 2. Decisions already made

Do not relitigate these. They came from the owner or from platform research done in September 2026 (see the appendix).

| Area | Decision | Why |
|---|---|---|
| Platform | Mobile web app opened in Safari from a bookmark or a home-screen icon that opens in Safari. Not a standalone home-screen web app in version 1. | iOS standalone web apps re-ask for camera permission on every launch and have had camera regressions in iOS 18.0 and 26.x (appendix) |
| Stack | Next.js (App Router) + TypeScript + Tailwind, built as a plain Node server (`output: "standalone"`) | Deploys unchanged on Vercel or Fly.io; one server route keeps the API key off the phone |
| Hosting | Vercel by default; Fly.io fully supported as the alternative; optional custom `.dev` domain | Section 8 |
| Reading engine | Claude Opus 5.5 vision via the Anthropic API, one request per page, streamed | Tolerates bad angles, glare, handwriting, and tables; infers reading order; can answer questions |
| Speech output | The phone's built-in speech (Web Speech API `speechSynthesis`), sentence by sentence | Free, no round trip to a server, most blind iPhone users already have an enhanced voice installed |
| Capture | Spoken framing guidance and automatic capture when the page is fully in view and steady, plus a manual Capture button always on screen | This is what the owner asked for; the manual button is the safety net |
| Features in version 1 | Playback controls, multi-page documents, handwriting, ask questions about the document | Chosen by the owner |
| Not in version 1 | Document history, summaries before reading, describing pictures on the page, cloud voices, on-device OCR, a live "read whatever text is in view" mode for envelopes and labels | Excluded to keep scope tight; leave clean seams for them (they are the obvious version 2 features) |
| Access control | One passcode stored in an environment variable, entered once on the phone | Enough for one trusted user |

## 3. Principles that override everything else

1. **One announcement channel, never two.** In read-aloud mode, status changes are spoken by the app and the live region stays silent. In VoiceOver mode, the same text goes to an `aria-live` region and the app speaks nothing unless the user has pressed "Play with app voice" for the current document. Nothing is ever announced through both.
2. **Nothing depends on seeing the screen.** Every state (waiting, framing, captured, reading, paused, error, page added) is announced. No decision requires reading text. No timeout expires silently.
3. **One primary action per screen**, and it is the biggest thing on the screen.
4. **Manual capture is always available** even while automatic capture is active, and it always works.
5. **Honest about uncertainty.** Unreadable words are announced as unreadable. The app never invents text, never summarizes when asked to read, and says when an answer is not in the document.
6. **Fast to first word.** Speech should begin within a few seconds of capture. Measure the time from capture to first spoken word and keep it low. Never leave more than three seconds of silence without a cue (a short tone or a word).
7. **Real semantics.** Native `<button>` elements with visible text labels, logical focus order, no custom swipe or multi-finger gestures (VoiceOver takes single taps and one-finger swipes for itself). Keyboard shortcuts are a bonus, not a substitute.
8. **Big targets and high contrast.** Minimum 64 by 64 CSS pixels for primary controls, 48 for secondary, contrast of at least 7:1 for text, large type, so a low-vision user or a sighted helper can also use it.
9. **Keys stay on the server.** The Anthropic key never reaches the browser.
10. **Small and boring.** Prefer the browser's built-in APIs over libraries. No OpenCV in version 1. Keep the client bundle small; the phone may be several years old.

## 4. The experience, screen by screen

These scripts are product decisions. Use this wording (you may fix grammar and tighten). All spoken lines go through the single announcement channel from principle 1.

### Screen 0: Start and first launch

iOS will not play speech or audio until the user has tapped something, and the camera permission prompt should be explained before it appears. So:

1. The first thing on screen is one full-screen button labelled **Start** (visible text "Start. Tap anywhere."). With VoiceOver on, VoiceOver reads it and the user double-taps; without VoiceOver, any tap works.
2. On tap: unlock audio (create the audio context, speak an empty utterance). On the very first launch, say: *"Document Reader. Do you use VoiceOver? Tap the top half of the screen for yes, or the bottom half for no."* The screen shows two half-screen buttons: **I use VoiceOver** (top) and **Read aloud to me** (bottom). Store the choice. (A VoiceOver user hears this question twice, once from the app and once from VoiceOver; that happens only on this one screen, and their choice silences the app voice from then on.)
3. If the passcode has never been accepted on this phone, show the passcode screen: one labelled input and a large **Continue** button. Say: *"Enter the passcode, then press Continue."* Store the passcode in `localStorage` after the server accepts it.
4. Say: *"I need the camera to see the page. Tap Allow if your phone asks."* Then request the camera and go to the camera screen.
5. If camera permission is denied: *"I can't use the camera. In Settings, open Safari, then Camera, and choose Allow. Then come back here."* Offer **Use phone camera instead** (section 6.1). If the page is running inside another app's browser (a link opened from Messages or Mail can do this), the camera request fails without a prompt; detect that and say: *"Please open this page in Safari."*

### Screen 1: Camera

Live camera preview, full screen, `aria-hidden` (there is nothing useful to describe). On top of it:

- A short status line in large text that always shows the current spoken cue.
- A huge **Capture** button across the bottom third of the screen.
- Smaller buttons: **Use phone camera instead**, **Settings**.
- If a document is already in progress: **Back to reading**, and the heading reads "Add page 2" (or whatever number).

On entering the screen: *"Lay the phone flat on the page, then lift it slowly. I'll tell you when I can see the whole page, or press Capture to take the picture yourself."* (Laying the phone on the page and lifting is the technique blind users are taught for guided scanners; it beats "hold it a foot above".)

Framing cues (section 6.2), spoken at most one every 1.5 seconds, never the same cue twice within 4 seconds:

| Situation | Cue |
|---|---|
| Frame too dark | *"Too dark. Turn on a light."* |
| Strong glare on the page | *"Glare. Tilt the phone a little."* |
| No page found | *"I can't see a page. Lift the phone slowly."* |
| Page too small in frame | *"Move closer."* |
| Page overflowing the frame on several sides | *"Move back."* |
| Page cut off on one side | *"Move left."* / *"Move right."* / *"Move up."* / *"Move down."* (the direction the phone should move; confirm the sign with a real test and note it) |
| Page fully visible, phone still moving | *"I see the whole page. Hold still."* |
| Motion blur when about to capture | *"Blurry. Hold still."* |
| Fully visible and steady for about 700 ms | Shutter sound, then *"Got it. Reading."* |

After a capture, automatic capture is disarmed until the user asks for another page, so the app never fires twice by accident. Guidance set to Minimal speaks only the "Hold still" cue and the shutter.

### Screen 2: Reading

The transcript fills the screen as real text: the title as `<h1>`, headings as `<h2>`, paragraphs as `<p>`, list items as list items, table rows as short "label: value" sentences. Unclear words are visually marked.

**Read-aloud mode.** The sentence being spoken is highlighted. A fixed control bar at the bottom, in this order, all real buttons with visible labels:

- Row 1 (largest): **Back** (one sentence), **Play/Pause**, **Forward** (one sentence)
- Row 2: **Previous paragraph**, **Next paragraph**, **Spell** (spells the current sentence letter by letter, naming digits and punctuation), **Slower**, **Faster**
- Row 3: **Ask a question**, **Add page**, **New document**, **Settings**

Spoken lines in read-aloud mode:

- As soon as the meta line and the first block arrive, say the model's title line (for example *"A letter from Pacific Gas and Electric about your October bill."*), then read the text. If the model reported a warning (part of the page cut off, hard to read), say the warning after the title, then read what is available.
- If the model says the photo is unusable: say its reason (for example *"The picture is too blurry. Hold the phone still and try again."*), then return to the camera screen with automatic capture armed again.
- *"Paused. Paragraph 3 of 7, page 1 of 2."* / *"Resuming."* / *"Speed one point five."* / *"Start of document."* / *"Page 2."* at a page boundary / *"End of document. Press Play to hear it again, Ask a question, or Add page."*
- When a page is added while reading is still going, nothing extra is spoken; the new page is appended and reading continues into it with *"Page 2."* at the boundary. If reading had already finished: *"Page 2 added."* and reading continues from the start of that page.
- Every unclear or doubtful word is spoken as *"unclear word"* or *"possibly"* (section 6.5), never silently skipped.

Keyboard shortcuts for a Bluetooth keyboard: Space play/pause, Left/Right one sentence, Up/Down paragraph.

**VoiceOver mode.** The same transcript, with no highlighting and no automatic speech. The live region says the title as soon as it arrives, then, when the page is complete, *"Page 1 ready. 7 paragraphs. Swipe right to read."* and focus moves to the transcript heading. VoiceOver reads the text at the user's own pace with the rotor. Buttons below the transcript: **Play with app voice** (turns the app reader on for this document and reveals the read-aloud controls above), **Ask a question**, **Add page**, **New document**, **Settings**.

### Screen 3: Ask a question

- Say: *"Ask your question, then press Send. Or hold Talk to speak it."*
- A large text field (iOS keyboard dictation works here, including with VoiceOver), a **Send** button, and a **Hold to talk** button that uses the browser's speech recognition when available. If recognition is unavailable or fails, say so once and leave the text field as the way in.
- The answer streams in and is spoken as it arrives (read-aloud mode) or announced through the live region when complete (VoiceOver mode). After it: *"Ask another question, or press Back to reading."*
- Questions and answers stay on screen as an accessible list for the session.

### Settings

A simple list of real controls, each announcing its new value when changed:

- **How the app talks to you**: Read aloud (app voice) / VoiceOver (I use a screen reader). This is the first setting, with one explanatory sentence next to it.
- **Voice**: voices available for the current language, with a **Preview** button.
- **Speed**: 0.7 to 2.0 in steps of 0.1. Default 1.0.
- **Automatic capture**: On / Off. Default On.
- **Guidance**: Full / Minimal. Default Full.
- **Sounds**: On / Off. Default On.
- **Forget passcode** (button).

All settings persist in `localStorage`.

## 5. Architecture

```
Phone (Safari)                                    Server (Vercel or Fly.io)
┌──────────────────────────────┐                  ┌────────────────────────────┐
│ Camera screen                │                  │ POST /api/auth             │
│  getUserMedia -> <video>     │                  │  checks the passcode       │
│  frame analysis (small       │  JSON, base64    │                            │
│  canvas, 4-8 fps)            │  JPEG, one page  │ POST /api/read             │
│  capture -> JPEG             │ ───────────────► │  validates passcode, size  │
│                              │ ◄──── NDJSON ─── │  calls Claude (streaming)  │
│ Reading engine               │                  │  validates NDJSON lines    │
│  NDJSON parser -> blocks     │  transcripts +   │  streams NDJSON back       │
│  sentence splitter           │  question        │                            │
│  speech queue (one sentence  │ ───────────────► │ POST /api/ask              │
│  per utterance)              │ ◄──── text ───── │  calls Claude (streaming)  │
│ Live region / announcer      │                  │  streams plain text back   │
│ Settings (localStorage)      │                  │                            │
└──────────────────────────────┘                  └────────────────────────────┘
```

- Next.js App Router, TypeScript strict, Tailwind, `output: "standalone"`. Node runtime for the API routes (not Edge). On Vercel set `maxDuration` on the routes to at least 120 seconds.
- The server is stateless. Transcripts and images live in the browser for the session only; keep the current document (without images) in `sessionStorage` so an accidental reload does not lose it.
- Dependencies beyond Next, React, and Tailwind: `@anthropic-ai/sdk`, `zod`, and dev tooling (Vitest, Playwright, ESLint, axe). Add anything else only with a written reason in `CLAUDE.md`.

## 6. Detailed requirements

### 6.1 Camera

- `getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })`. Read `track.getSettings()` and log the real resolution; iPhones usually grant 1080p but may deliver 720p on older devices. iOS 18 can switch lenses mid-stream; nothing to do about it, just do not cache the track settings.
- **Still capture:** use `ImageCapture.takePhoto()` when the API exists (Safari 18.4 and later; it returns a full-sensor photo, much sharper than the video frame), inside a try/catch, and fall back to drawing the `<video>` to a canvas at the track's native resolution. Feature-detect; never assume either path.
- Continuous autofocus is the default on iPhones and there are no focus constraints on iOS. Do not fight it.
- **Torch:** only if `track.getCapabilities().torch` is true, try `track.applyConstraints({ advanced: [{ torch: true }] })` when the frame is too dark; otherwise rely on the "Too dark" cue. WebKit gates this by device and lens.
- **Use phone camera instead:** an `<input type="file" accept="image/*" capture="environment">` that opens the iOS camera app. It works even inside other apps' browsers, its controls are labelled for VoiceOver, and it returns a 12 megapixel EXIF-rotated JPEG. Draw it with `createImageBitmap(file, { imageOrientation: "from-image" })` before downscaling. After the photo is picked, continue exactly as after an automatic capture. This is the escape hatch, not the primary path, because it gives no framing feedback.
- Stop the camera stream when leaving the camera screen and restart it on return, so the phone does not run hot while reading.
- Set `navigator.audioSession.type = "playback"` when the property exists (iOS 17 and later) so sounds and speech are not muted by the ring/silent switch; confirm on the device and note the result.
- HTTPS is required for the camera. Document local testing on a real phone (Next's `--experimental-https`, or a tunnel such as Cloudflare Tunnel or ngrok).

### 6.2 Framing analysis

Run a light analysis loop on the live video at 4 to 8 frames per second on a small canvas (about 160 pixels wide, keeping the aspect ratio). Everything below is a heuristic; favor simple and predictable, tune on real photos, and remember the model tolerates imperfect framing, so the guidance only has to be roughly right.

Per frame compute:

- **Brightness:** mean luma. Below about 60 (0 to 255): "Too dark".
- **Glare:** more than about 3 percent of page-region pixels above 250: "Glare".
- **Page region:** paper is usually the brightest large region. Threshold luma (Otsu, or a high percentile), erode once to drop specks, take the bounding box of the largest bright blob. If that fails (white page on a white table), fall back to the bounding box of "text-like" edge density: gradient magnitude, box-filtered, thresholded.
- From the bounding box: fraction of the frame covered (under about 40 percent: "Move closer"; touching three or four edges: "Move back"), and which edges it touches (touching exactly one or two edges means the page is cut off there: "Move left/right/up/down"). A page whose four corners are at least 3 percent inside the frame counts as fully visible.
- **Steadiness:** mean absolute difference between this frame and the previous one, below about 2 to 3 (0 to 255) for 600 to 700 ms.
- **Sharpness:** variance of a Laplacian on the small grayscale frame. Absolute thresholds vary by phone, so calibrate against the running maximum seen this session and require, say, 60 percent of it.

Cue policy: compute one "situation" per frame, apply hysteresis (the same situation on 2 or 3 consecutive frames before it is spoken), one cue per 1.5 seconds, no identical cue within 4 seconds, and "Hold still" takes priority over everything else. Write the analysis as pure functions over `ImageData` so they can be unit tested with synthetic frames (a white rectangle on gray, shifted, cut off, blurred, with a bright spot).

If the heuristic proves unreliable on real pages, the documented fallback is `jscanify` on a custom slim OpenCV.js build, lazy-loaded only on the camera screen. Do not start there: the WASM is several megabytes and takes seconds to load on cellular.

### 6.3 Automatic capture

Fire when: page fully visible, brightness and glare acceptable, steady for 600 to 700 ms, sharpness above the calibrated threshold. Then: shutter sound, capture, run the sharpness check on the full-size capture, and if it is blurry say "Blurry. Hold still." and re-arm. Otherwise say "Got it. Reading." and go to the reading screen. Disarm until the user presses Add page or New document. The manual Capture button skips every check.

### 6.4 Image preparation and upload

- Downscale so the long edge is 2000 pixels (never above 2576, where the model downsizes anyway), encode as JPEG at quality 0.85, base64. Typical result is 400 KB to 1 MB, well under Vercel's 4.5 MB request body limit.
- Do not otherwise filter the image (no thresholding, no grayscale, no perspective correction in version 1); the model reads the photo better than a binarized version.
- Keep the capture in memory for the session in case the owner later wants a re-read or image-aware questions.
- Send one page per request: `{"image": {"mediaType": "image/jpeg", "data": "<base64>"}, "pageNumber": 1, "languageHint": "en" | null}` with the passcode in an `Authorization: Bearer` header.

### 6.5 Server: `POST /api/read`

Streams NDJSON (`Content-Type: application/x-ndjson`, `Cache-Control: no-cache`) back to the phone. The model itself is asked to write NDJSON so the first paragraph can be spoken before the page is finished. The server validates every line with zod, forwards only valid events, drops or repairs anything else (strip code fences, ignore prose), and appends its own `error` or `done` event if the stream ends abnormally. Resilience rule: if no valid `meta` line has arrived within the first 600 characters of model output, treat the whole output as plain text, split it on blank lines into paragraph blocks, and synthesize a meta line, so the user still hears the page.

Event protocol (client must tolerate unknown `type` values):

```
{"type":"meta","status":"ok"|"retry","language":"en","kind":"letter","title":"A letter from …","warning":"…optional…","problem":"…only when status is retry…"}
{"type":"block","kind":"heading"|"paragraph"|"list_item"|"table_row"|"label_value"|"note","text":"…"}
{"type":"done","blocks":12}
{"type":"error","message":"…spoken-friendly…"}
```

Markers inside `text`: `[unclear]` for a word that cannot be read; a word followed by `[?]` for a doubtful reading. The client speaks these as "unclear word" and "possibly" and marks them visually.

System prompt for the read call (use this text; adjust only if testing shows a concrete problem, and record why):

```
You are the reading engine inside an app that reads paper documents aloud to a blind person. You receive one photo of one page. Everything you write is spoken aloud by a text-to-speech voice, so write for the ear, not the eye.

Latency-sensitive: begin your visible answer immediately.

Output NDJSON only: one JSON object per line, no prose, no code fences, no blank lines.

Line 1 is always a meta line:
{"type":"meta","status":"ok" or "retry","language":"<BCP-47 tag of the page's main language>","kind":"<letter, bill, form, receipt, handwritten note, envelope, prescription, menu, other>","title":"<one short sentence saying what this is, e.g. 'A letter from Pacific Gas and Electric about your October bill'>","warning":"<optional, one short sentence if part of the page is cut off or hard to read but you can still read most of it>","problem":"<only when status is retry: one short sentence telling the user what to change, e.g. 'Only the left half of the page is visible. Move the phone to the right.'>"}

Use status "retry" only when you genuinely cannot read the page: it is badly blurred, too dark, mostly out of frame, or not a document at all. If most of the page is readable, use "ok", add a warning, and read what you can see. An upside-down or sideways page is fine; just read it.

Then write the page in natural reading order (columns top to bottom, left column before right), one line per block:
{"type":"block","kind":"heading" or "paragraph" or "list_item" or "table_row" or "label_value" or "note","text":"..."}

Rules for the text:
- Transcribe faithfully. Do not summarize, comment, translate, or correct the document. Keep the original language.
- Write for listening. Before a table, add one note block such as "A table with 4 rows. Columns: Date, Description, Amount." Then read each row as "Date: October 3. Description: Electricity. Amount: $45.10." For forms, read "Label: value", and say "blank" for an empty field.
- Keep amounts, dates, phone numbers, addresses, and reference numbers exactly as printed.
- Illegible word: write [unclear]. Doubtful reading: write your best reading followed by [?]. Never guess silently and never drop words.
- Handwriting: transcribe it the same way, marking doubtful words with [?].
- Skip logos, decorative lines, and page furniture. If a picture or diagram matters to the meaning, add one note block: "There is a picture here."
- Do not repeat the title in the blocks.

Finish with: {"type":"done","blocks":<number of block lines>}
```

User content for the read call: the image block first, then a text block: `Page {n}. Read this page.` (append `The document is probably in {language}.` when a hint exists).

### 6.6 Server: `POST /api/ask`

Input: `{"pages": ["<transcript of page 1 as plain text>", ...], "title": "...", "history": [{"role":"user"|"assistant","content":"..."}], "question": "..."}`. Streams plain text. System prompt:

```
You answer questions about a paper document for a blind person. The full transcript of every page is below. Answer in one to three short sentences that sound natural when spoken aloud. Quote exact amounts, dates, names, phone numbers, and addresses from the transcript. If the answer is not in the document, say so plainly in one sentence. No markdown, no lists, no symbols; write numbers and abbreviations the way they should be spoken. If the question is about something visual that the transcript cannot answer, say that you only have the text.
```

Put the transcript in the system prompt as a second text block marked with `cache_control: { type: "ephemeral" }` so repeated questions about the same document are served from the prompt cache. Keep the conversation history to the last ten turns.

### 6.7 Reading engine (speech)

This is the most important code in the app. Design it as a small state machine with `speechSynthesis` behind an interface, so it can be unit tested with a fake.

- **Sentence queue.** Split each block into sentences with `Intl.Segmenter(locale, { granularity: "sentence" })`. Each queue item knows its page, block, and sentence index and whether it starts a page or paragraph. Speak exactly one sentence per `SpeechSynthesisUtterance`, at most about 200 characters (split longer sentences at commas or semicolons). Keep a reference to the live utterance in a module-level variable; some engines garbage-collect it mid-speech and never fire `end`.
- **Start early.** Begin speaking as soon as the meta line and the first block arrive. If the queue runs dry while the server is still streaming, wait silently; if the wait exceeds 2 seconds, play a soft tick every 2 seconds until text arrives.
- **Controls.** Pause is `speechSynthesis.cancel()` plus remembering the current index; resume speaks that sentence again from its start. Do not use `pause()` or `resume()` (unreliable on iOS, implemented as cancel on Android). Back and Forward move the index and restart speech. Previous and Next paragraph move to block boundaries. Speed changes apply from the next sentence and are announced. Spell replaces the current sentence with a letter-by-letter reading ("capital P, a, y, space, 1, 2, 3, dot") at a slower rate. Do not depend on `boundary` events; they do not fire everywhere.
- **Robustness.** Advance on `end` and `error`; also run a watchdog: if an utterance has not ended after (its length divided by a generous speaking rate, plus 5 seconds), cancel and speak the next sentence. Handle `voiceschanged` (voices load asynchronously on iOS and the list is empty at first). Call `speechSynthesis.cancel()` on `pagehide`. The very first `speak()` after load must happen inside a tap handler; the Start button does this.
- **Voice selection.** Prefer a voice whose language matches the document language and whose name contains "Enhanced" or "Premium" (iOS names higher-quality downloaded voices that way); otherwise the default voice for that language; otherwise the system default. Cache the choice. The setup guide tells the owner how to download an enhanced voice (Settings, Accessibility, Spoken Content, Voices).
- **Normalization before speaking.** Replace `[unclear]` with "unclear word" and a trailing `[?]` with " possibly", collapse whitespace.
- **Screen lock.** Keep the screen on while reading with the Screen Wake Lock API when available (Safari 16.4 and later), re-requesting it on `visibilitychange`. iOS stops `speechSynthesis` when Safari is backgrounded or the screen locks; on return, announce *"Paused. Press Play to continue."* and stay paused. (Speech that survives the lock screen needs cloud audio through an `<audio>` element; that is a version 2 item, noted in section 2.)
- **Sounds.** Short tones via the Web Audio API (unlocked on the Start tap): shutter, tick, error, page-found. All under 300 ms, all switchable off in Settings. There is no vibration API on iOS, so audio is the only non-visual confirmation channel.

### 6.8 Accessibility and VoiceOver coexistence

- **Announcer.** One `announce(text, { priority })` function. In read-aloud mode it speaks (interrupting lower-priority speech; guidance cues are low priority, "Got it" and errors are high). In VoiceOver mode it writes to a visually hidden live region.
- **Live-region contract.** Two regions, both present in the DOM from first render and never re-created: a `role="status"` region (polite) for progress and cues, and a `role="alert"` region for failures. Both `aria-atomic="true"`. Do not add `aria-live="assertive"` to the alert region (VoiceOver on iOS announces it twice). Replace the text, never append; clear and re-set when the same message repeats. Throttle updates to about one per second on the camera screen or the polite queue backs up.
- In read-aloud mode the transcript is not a live region and reading does not move focus. In VoiceOver mode the transcript is ordinary content read by VoiceOver.
- Every screen has exactly one `<h1>`. Every control has a visible text label and, where the label is short, an `aria-label` with the full action ("Back one sentence").
- **Focus management.** On entering a screen, move focus to its heading (`tabindex="-1"` then `focus()`). After a capture, focus goes to the reading heading. After an error, to the error text. Never trap focus.
- Respect `prefers-reduced-motion`. No content depends on color alone. Text resizes to 200 percent without horizontal scrolling. Primary buttons 64 by 64 CSS pixels, secondary 48, full width where possible. Text at least 18 px, control labels at least 20 px.
- Run axe checks in the end-to-end tests and fix everything they report.

### 6.9 Multi-page documents

- **Add page** returns to the camera with the heading "Add page N", arms automatic capture, and on capture appends the page. Pages are read in order and reading announces page boundaries ("Page 2."). The Ask feature receives all pages.
- If a page comes back with status `retry`, the page number is not consumed.
- A document is a client-side object `{ title, language, pages: [{ number, blocks, imageBlob }] }`, saved to `sessionStorage` without the images.

### 6.10 Access control and limits

- `POST /api/auth` verifies the passcode against `APP_PASSCODE` and returns 204 or 401. Every other route checks the same bearer value, compared in constant time.
- Reject request bodies over 6 MB and images with a media type other than JPEG, PNG, or WebP. Check the `Origin` header against the deployed hostname.
- Log one line per request with timing, tokens used, and the model's stop reason. No document text in logs.

### 6.11 Errors, spoken

Every error maps to one short spoken sentence plus a next step, for example *"I couldn't reach the reading service. Check your connection, then press Capture to try again."* Technical detail goes to the console and to small on-screen text, never to speech. Network errors retry once automatically before being announced.

### 6.12 Opening the app

- No standalone home-screen web app in version 1: omit `apple-mobile-web-app-capable`, and if you ship a manifest set `"display": "browser"`. Ship the icon and theme color so a home-screen bookmark looks right.
- The setup guide explains: open the URL in Safari, add it to the home screen, and on iOS 26 turn off "Open as Web App" for that icon so it opens in Safari. Also explain creating a Siri Shortcut ("Open URL") named something like "Read a document", because Siri cannot open a home-screen web page by name but can run a shortcut.
- No service worker in version 1.

## 7. Claude API specifics

Use the official TypeScript SDK `@anthropic-ai/sdk`. Do not call the HTTP API by hand and do not use any other provider's SDK.

- **Model:** `claude-opus-5-5` (Claude Opus 5.5, the documented default model as of September 2026; $4 per million input tokens, $20 per million output tokens, prompt cache reads at 5 percent of the input price). Put the ID in two constants, `READ_MODEL` and `ASK_MODEL`, both defaulting to it. If the owner finds reading too slow, the one-line change is to `claude-sonnet-5` ($2 / $10, faster); measure time to first spoken word on both and let the owner decide.
- **Thinking and effort:** thinking is adaptive and always on with this model; omit the `thinking` parameter entirely (sending `disabled` or `budget_tokens` is a 400). Set `output_config: { effort: "low" }` on the read route (transcription needs perception, not deliberation, and latency matters) and `"medium"` on the ask route. Do not send `temperature`, `top_p`, or `top_k`.
- **Streaming:** always use `client.beta.messages.stream(...)` and pipe the `text` deltas into the response stream. Set `max_tokens` to 16000. Use `stream.finalMessage()` at the end to log usage and `stop_reason`.
- **Refusal fallback:** include `betas: ["server-side-fallback-2026-07-01"]` and `fallbacks: "default"` on every call, so a safety-classifier decline is retried server-side on the fallback model Anthropic recommends for that category. If the SDK's TypeScript types do not accept the scalar `"default"` form, cast the request object rather than dropping the parameter. Always check `stop_reason === "refusal"` and turn it into a spoken error ("I couldn't read this page. Try again or try another page.") rather than silence.
- **Images:** send the image content block before the text block. Supported types are JPEG, PNG, GIF, and WebP; base64 must contain no newlines; 10 MB maximum per image; 32 MB per request. This model reads images up to a 2576 pixel long edge natively (4784 visual tokens maximum); a 1500 by 2000 pixel photo costs about 3,900 input tokens, so a page read costs about 3 cents including the output, and a question about 1 cent. Twenty pages a day is under a dollar.
- **Prompt caching:** the ask route's transcript block carries `cache_control: { type: "ephemeral" }`; the minimum cacheable prefix on this model is 512 tokens, so very short documents will not cache, which is fine. Check `usage.cache_read_input_tokens` in the log to confirm it works on longer ones.
- **Errors:** catch the SDK's typed errors most specific first (`Anthropic.AuthenticationError`, `Anthropic.RateLimitError`, `Anthropic.APIConnectionError`, then `Anthropic.APIError`) and map each to a spoken message. The SDK retries transient failures twice by default; leave that on.
- **Key:** `ANTHROPIC_API_KEY` from the environment, read only in server code. `new Anthropic()` with no arguments picks it up.
- **Privacy note for the setup guide:** photos are sent to Anthropic's API to be read, are not used for training, and are not retained beyond the request; the app stores nothing on a server.

## 8. Hosting

The app is a plain Node server, so both of these work without code changes. Ship the configuration for both; the setup guide has one section per host and the owner picks.

- **Vercel (default).** Import the GitHub repository into a Vercel project, set `ANTHROPIC_API_KEY` and `APP_PASSCODE` as environment variables, deploy; every push to the main branch redeploys. Limits that matter: 4.5 MB request body per function call (our uploads are under 1 MB), streaming responses supported from Node route handlers, function duration on the Hobby plan is 300 seconds with Fluid compute (set `maxDuration` on the routes anyway). The Hobby plan is free for non-commercial personal use, which this is.
- **Fly.io (alternative).** The app runs as a container: `next.config` with `output: "standalone"`, a Dockerfile (`fly launch` can generate one for Next.js; review it), and a `fly.toml` with one machine of 512 MB to 1 GB memory, HTTPS forced, and auto stop/start enabled. Secrets go in with `fly secrets set ANTHROPIC_API_KEY=... APP_PASSCODE=...`. Fly provides a free `<app>.fly.dev` hostname with a TLS certificate, which satisfies the camera's HTTPS requirement. There are no serverless body-size or duration limits, but keep the app's own 6 MB cap. Fly needs the `flyctl` command line tool and a payment method, and a single small machine typically costs a few dollars a month. Fly's documentation was not reachable from the environment where this prompt was written, so confirm the exact commands against fly.io/docs when writing the setup guide.
- **Custom domain (optional).** A `.dev` domain is a good fit: the whole top-level domain is HTTPS-only, matching the camera requirement, and both hosts issue certificates automatically for custom domains. The setup guide covers adding one in a short optional section.

## 9. Build plan

Work in this order. Each phase ends with: typecheck, lint, unit tests, and build all passing; a commit with a descriptive message; and a short entry in `docs/PROGRESS.md` saying what works, what is stubbed, and what you changed from this document and why. Do not create pull requests unless asked. Do not wait for approval between phases.

**Phase 0: Scaffold and plan.** Read this whole document. Create the Next.js app (App Router, TypeScript strict, Tailwind, ESLint, Vitest, Playwright with Chromium, `output: "standalone"`). Write `CLAUDE.md` (stack, commands, conventions from section 3, an "Assumptions" section) and `docs/PLAN.md` (your module breakdown and build order). Add `.env.example` with `ANTHROPIC_API_KEY` and `APP_PASSCODE`. Commit.

**Phase 1: Straight line, no guidance.** Start screen with audio unlock, mode choice, and passcode; camera preview with only the manual Capture button; image preparation; `/api/auth` and `/api/read` with the NDJSON protocol; reading screen that speaks the page as it streams, with Play/Pause only, in read-aloud mode; the VoiceOver-mode transcript with the live-region announcements. Verify end to end against the real API with a rendered test page (render a letter-sized page of text to a PNG, then distort it: slight rotation, uneven lighting, JPEG noise) and a handwritten sample if you can produce one. Record time from request to first block and to first spoken word.

**Phase 2: Full playback and accessibility.** All controls from Screen 2, sentence queue, spell, speed, wake lock, watchdog, marker normalization, voice selection, Settings screen, the announcer with both modes, focus management, keyboard shortcuts, "Play with app voice" in VoiceOver mode. Add the axe checks and start `docs/TESTING-ON-IPHONE.md`.

**Phase 3: Framing guidance and automatic capture.** Analysis functions with unit tests on synthetic frames, the cue policy, glare and brightness checks, the shutter and sharpness gate, the Minimal guidance setting, the torch attempt, `ImageCapture` with the canvas fallback, and the file-input fallback with the in-app-browser detection. Playwright with a fake camera (Chromium's `--use-fake-device-for-media-stream` and `--use-file-for-fake-video-capture` with a short video of a page moving into frame) proving the cues fire in the right order and capture happens.

**Phase 4: Multi-page and questions.** Add-page flow with page boundaries in speech, `sessionStorage` persistence, `/api/ask` with streaming and caching, the Ask screen with dictation and the speech-recognition button.

**Phase 5: Hardening and handover.** Error mapping for every failure you can provoke (network off, wrong passcode, refusal, oversized image, malformed model output, camera denied, in-app browser, speech engine with no voices). Icons and manifest per 6.12. Bundle size check. Dockerfile and `fly.toml`. Write `docs/SETUP.md` for the owner: deploying on Vercel, deploying on Fly.io, optional custom domain, opening the URL in Safari on the iPhone, entering the passcode, adding to the home screen (and the iOS 26 toggle), allowing the camera, downloading an enhanced voice, the Siri Shortcut, and a first-use walkthrough. Finish `docs/TESTING-ON-IPHONE.md`: a manual checklist the owner and the user run together (VoiceOver on and off, low light, glare, handwriting, a two-page letter, locking the screen mid-read, an incoming call, the silent switch, the phone-camera fallback, a link opened from Messages). Final commit.

## 10. Testing

- **Unit (Vitest):** NDJSON parser (partial lines, garbage lines, a fenced response, the plain-text fallback), sentence splitter and normalizer, speech queue state machine against a fake `speechSynthesis` (utterance order, pause/resume index, watchdog, speed change timing, spell), framing analysis on synthetic frames, cue policy timing, zod validation on the server, announcer routing per mode.
- **Route tests:** call the route handlers directly with the Anthropic client mocked (a stubbed stream), and, in a clearly marked script that needs a real key, once against the real API with the test page.
- **End to end (Playwright, Chromium, iPhone viewport):** Start to reading with a fake camera and a mocked `/api/read` NDJSON fixture; assertions on the live-region text in VoiceOver mode and on the utterance log in read-aloud mode (inject a fake `speechSynthesis` into the page). Axe on every screen.
- **Manual:** `docs/TESTING-ON-IPHONE.md`, because nothing in CI runs iOS Safari with a real camera and real VoiceOver. Be explicit in `docs/PROGRESS.md` about what could only be verified this way.

## 11. Definition of done

- All five phases complete and committed; `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, and `npm run build` pass from a clean checkout.
- A fresh deploy with the two environment variables reads a photographed page end to end.
- `docs/SETUP.md`, `docs/TESTING-ON-IPHONE.md`, `docs/PROGRESS.md`, and `CLAUDE.md` exist and are accurate.
- `docs/PROGRESS.md` ends with a list of everything that needs the owner (deploying, the manual iPhone checklist, deciding on the model), and every assumption you made.

## 12. How to work

- Give the complete plan before writing code, then build. Prefer small, well-named modules over clever ones.
- Test against the real API sparingly (a handful of calls per phase) and with fakes everywhere else.
- When a browser API is in doubt, write the code so it degrades gracefully and note the uncertainty in `docs/TESTING-ON-IPHONE.md` as something to confirm on the device. Do not silently drop a feature because it cannot be verified in CI.
- Never skip or weaken a test to get green. If something in this document turns out to be impossible or harmful, do the closest reasonable thing and say so in `docs/PROGRESS.md`.
- Keep commit messages descriptive. Do not put model names or session identifiers in code comments or commits.

## 13. Assumptions you may change

Change these if you find a concrete reason, and record the reason:

- The paper is brighter than the surface it lies on (the framing heuristic's first strategy).
- 2000 pixels on the long edge is enough for small print. If the test page's smallest text is misread, try 2576.
- Effort `low` on the read route is accurate enough. If unclear-word markers are frequent on clear text, try `medium` and compare.
- Speech recognition in Safari is good enough for questions. If not, the text field with keyboard dictation is the primary path and the Talk button is removed.
- The read-aloud controls are hidden in VoiceOver mode until "Play with app voice" is pressed. If the user wants them always visible, that is a setting, not a redesign.

## Appendix: platform facts verified in September 2026

Findings from research done while writing this prompt, so you do not have to rediscover them. Sources are listed where the claim is non-obvious.

- **Guided-capture products** (Microsoft Seeing AI, Envision, Google Lookout) all use the same cue grammar: name the missing edge or corner, then "hold still", then capture automatically about two seconds later. Blind users are taught to lay the phone on the page and lift slowly. Seeing AI refusing to read an upside-down page is a common complaint; read it anyway. (afb.org/aw/18/8/15185, lighthouseguild.org Seeing AI tutorials, support.letsenvision.com Scan Text, support.google.com/accessibility/android/answer/9031274)
- **VoiceOver in Safari** takes single taps (select), double-taps (activate), and one-finger swipes (next/previous) for itself; two-finger swipe down is "read from here". A web page never sees those as ordinary gestures, so custom gestures are pointless. There is no reliable way for a page to detect a screen reader; the mode must be the user's explicit choice. (support.apple.com/guide/iphone/use-voiceover-gestures-iph3e2e2281/ios)
- **Self-voicing while VoiceOver runs** produces two overlapping voices with no shared queue, and `speak()` can silently fail to start. Hence the mode switch and the "one channel" rule.
- **Live regions:** `role="status"` for progress, `role="alert"` only for failures, never `role="alert"` plus `aria-live="assertive"` (double announcement on iOS), `aria-atomic="true"`, regions present at load and updated in place. (tetralogical.com/blog/2024/05/01/why-are-my-live-regions-not-working)
- **`speechSynthesis` on iOS:** first `speak()` must come from a tap; `getVoices()` is empty until `voiceschanged`; `pause()`/`resume()` are unreliable; speech stops when Safari is backgrounded or the screen locks; `boundary` events cannot be relied on. Keep utterance references or `end` may never fire. Chunk by sentence. (weboutloud.io/bulletin/speech_synthesis_in_safari, talkrapp.com/speechSynthesis.html)
- **Vibration:** iOS Safari has no vibration API, and as of iOS 26.5 script-triggered haptic tricks are blocked. Audio is the confirmation channel.
- **Screen Wake Lock:** Safari 16.4 and later in a Safari tab.
- **Camera in a home-screen web app:** works since iOS 13.4 but the permission is not remembered between launches (WebKit bug 215884), and there were camera regressions in iOS 18.0 to 18.1 and an unresolved one in iOS 26.x where frames arrive rotated (WebKit bug 323550, developer.apple.com/forums/thread/801146). Run in the Safari tab.
- **Camera in in-app browsers:** most apps' embedded browsers on iOS do not expose `getUserMedia`; the request fails without a prompt. The file-input fallback still works there.
- **`ImageCapture.takePhoto()`:** added in Safari 18.4; returns a full-sensor still. Feature-detect. (developer.apple.com/documentation/safari-release-notes/safari-18_4-release-notes)
- **Torch:** WebKit supports the `torch` constraint on some devices and lenses; always check `getCapabilities()` first.
- **Frame analysis performance:** 160 to 480 pixel frames at 4 to 8 frames per second is comfortable on mid-range phones; OpenCV.js is 8 to 10 MB of WASM (about 4 MB in a custom build) and takes seconds to load on cellular, which is why it is not in version 1.
- **On-device OCR (Tesseract.js 7):** roughly 85 to 90 percent character accuracy on clean print, much worse on phone photos in poor light, poor on handwriting, no reading-order intelligence, 3 to 10 seconds per page on a phone. Not acceptable for a reader whose user cannot check the output, which is why the cloud model was chosen.
- **Claude vision:** JPEG, PNG, GIF, WebP; 10 MB per image; 8000 by 8000 pixel maximum; visual tokens are `ceil(width / 28) * ceil(height / 28)`; Claude 4.7 and later models read up to a 2576 pixel long edge (4784 tokens) before downscaling; put the image before the text. (platform.claude.com/docs/en/build-with-claude/vision)
- **Vercel:** 4.5 MB request body per function call, streaming responses from Node route handlers, 300 second function duration on Hobby with Fluid compute, Hobby is for non-commercial use. (vercel.com/docs/functions/limitations)
- **Cloud text-to-speech**, if version 2 wants voices that keep playing with the screen locked: OpenAI `gpt-4o-mini-tts` about 1.5 cents per minute, ElevenLabs Flash about $50 per million characters, Google Neural2 $16 and Azure Neural about $15 per million characters, all streamable into an `<audio>` element with Media Session lock-screen controls.
