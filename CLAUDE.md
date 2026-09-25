# CLAUDE.md

Document Reader is a mobile web app that reads paper documents aloud for a blind iPhone user. The full product specification is `PROMPT.md`. Read it before changing behavior; this file only summarizes it.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run dev:https` | Development server with a self-signed certificate (needed to test the camera from a phone on the same network) |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules, including jsx-a11y) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit and route tests |
| `npm run test:e2e` | Builds, starts the production server, runs Playwright (Chromium, fake camera, mocked API) |
| `npm run build` | Production build (`output: "standalone"`) |
| `npm start` | Runs the standalone production server (copies static assets next to it first) |
| `npm run fixtures` | Regenerates test images, the fake camera video, and the app icons |
| `npm run check:real-api` | Sends the test page to the real Anthropic API through the read route. Needs `ANTHROPIC_API_KEY`; costs a few cents |

`FAKE_MODEL=1` makes the server use a scripted model instead of the Anthropic API. The e2e tests set it; never set it on a deployment.

Before every commit: `npm run lint && npm run typecheck && npm test && npm run build`.

## Stack

Next.js 16 (App Router) with TypeScript strict and Tailwind CSS v4. `@anthropic-ai/sdk` and `zod` are the only runtime dependencies beyond Next and React. Vitest for unit and route tests, Playwright 1.56.1 with axe for end-to-end tests.

## Layout

- `src/app` holds the page and thin API route files. Route logic lives in `src/lib/server` so it can be tested without Next.
- `src/lib/shared` has code used by both browser and server (protocol schemas, NDJSON splitting, spoken messages).
- `src/lib/server` is server-only: Anthropic client, prompts, the model-output parser, auth, body limits, logging.
- `src/lib/client` is browser logic as plain TypeScript classes (speech, reader, announcer, camera, frame analysis, document session). Keep it free of React so it can be unit tested with fakes.
- `src/components` holds React screens. They read state from the client controller through small stores and never own long-lived logic.
- `tests/unit`, `tests/route`, `tests/e2e`, `tests/fixtures`; `scripts` for fixtures and checks; `docs` for the plan, progress, setup, and the manual iPhone checklist.

## Conventions (PROMPT.md section 3)

1. One announcement channel, never two: in read-aloud mode the app speaks and the live region is silent; in VoiceOver mode the live region announces and the app speaks nothing unless "Play with app voice" is on for the current document.
2. Nothing depends on seeing the screen. Every state change is announced; no silent timeouts.
3. One primary action per screen, and it is the largest control.
4. Manual capture always works, even while automatic capture is armed.
5. Honest about uncertainty: facts are never invented and nothing is summarized. Unreadable or doubtful facts are announced ("unclear word", "possibly"). By the owner's decision, small filler words and obvious word endings may be restored from context.
6. Fast to first word; never more than three seconds of silence without a cue.
7. Real semantics: native buttons with visible labels, one `h1` per screen, no custom gestures.
8. Big targets (64 px primary, 48 px secondary) and at least 7:1 text contrast.
9. The Anthropic key never reaches the browser.
10. Small and boring: browser APIs over libraries.

Also: never skip or weaken a test to get green, and do not put model names in code comments.

## Assumptions

Decisions made while building that `PROMPT.md` did not settle. Each has a reason.

- **ESLint 9, not 10.** ESLint 10 crashes `eslint-plugin-react` (used by `eslint-config-next` 16.3), so ESLint stays on 9.39 until the Next.js config supports 10.
- **TypeScript 5.9, not 7.** TypeScript 7 is the new native compiler; `typescript-eslint` 8 and Next's build-time type check are validated against 5.x.
- **Playwright pinned to 1.56.1.** It matches the Chromium build preinstalled in the build sandbox. `playwright.config.ts` uses `/opt/pw-browsers/chromium` when it exists and otherwise the browser from `npx playwright install chromium`.
- **Framing thresholds** live in `FRAMING` in `src/lib/client/vision/framing.ts` and were tuned on synthetic frames and generated videos, not on a real iPhone. Automatic capture has two paths: the strict one (whole page in view, steady, sharp) and a forgiving one that takes the picture after `calmMs` with the page within `calmShift` pixels of where it was, leaving the judgement to the reading model. Tune `calmMs`, `calmShift`, `motion`, and `steadyMs` on the device.
- **Gap filling.** In a hard photo the model may silently restore filler words (the, of, please, and so on) and complete an everyday word whose visible letters allow one reading. Facts never come from context: numbers of any kind, names, addresses, medicine names and doses, codes, and meaning-changing words (not, paid, due, cancelled) are read only from what is visible, marked `[?]` when partly readable and `[unclear]` when not. `tests/unit/prompts.test.ts` guards these rules.
- **Photos for hard conditions.** Images go up at 2576 pixels on the long edge (the most the model uses). Without a full-sensor photo (iOS before 18.4), the app takes four video frames 90 ms apart and sends the sharpest. Dim or faded photos get a linear brightness stretch of at most 2.5 times (`src/lib/client/camera/enhance.ts`); well exposed photos are sent untouched.
- **No remarks about the photo.** The read prompt has no warning line and the server drops one if the model writes it. If any text is readable the app reads it; a retry with a spoken reason happens only when nothing is.
- **Design.** `docs/DESIGN.md` is the per-screen spec (Apple-style: content first, restraint, glass only for floating controls). Each screen shows only its core controls; everything else sits behind a "More" button (`MoreButton` in `src/components/ui.tsx`, a disclosure with `aria-expanded`). Reading: Back, Play or Pause, Forward, New document, Ask a question, More. Camera: the full-screen picture, a status capsule, More (Open a PDF, Use phone camera instead, Settings), and one Capture panel. The camera never tells the user where to put the phone: it says "Camera ready." and then only cues. Settings and Ask have Done in a navigation bar. `tests/e2e/simple.spec.ts` pins these sets; add new controls behind More unless they are used on almost every document.
- **Colour themes.** Automatic (the default) follows the iPhone's light or dark mode through `prefers-color-scheme`; the `@theme` block in `src/app/globals.css` is Light, and Dark and Black and yellow override the same variables under `[data-theme]` (Automatic removes the attribute). Buttons have no borders except in Black and yellow and with Increase Contrast. Every text and background pair is 7:1 or better in all three, and `tests/e2e/themes.spec.ts` runs axe on each. The start-up script applies the saved theme before the first paint. Flat design: no gradients or glows. Icons are inline SVGs in `src/components/icons.tsx`, always decorative and next to a visible label.
- **Focus rings** show only after a key press (the start-up script sets `data-keyboard` on `<html>`), and never on headings the app focuses for VoiceOver (`tabindex="-1"`).
- **PDFs** are read in one streamed request: the phone sends the file as base64 (`pdf` instead of `image` in the read request), the model gets it as a `document` block with `READ_PDF_SYSTEM_PROMPT` and writes `{"type":"page"}` between pages, and the parser turns those into numbered `page` events. PDF pages are marked `fromPdf` and cannot be retaken; Add page waits until the PDF has been read. Limits: 15 MB per PDF and 64,000 output tokens.
- **Direction cues** assume the phone is held flat over a page on a table with its top edge pointing away from the user ("Move away from you" means toward the top of the phone). The sign must be confirmed on a real iPhone (see `docs/TESTING-ON-IPHONE.md`).
- **Minimum iOS is 16.** The `browserslist` in `package.json` targets iOS 16, so the compiled JavaScript has no class static blocks or regular-expression lookbehind (Safari only parses those from 16.4), and `tests/e2e/bundle.spec.ts` fails if either appears. Tailwind CSS v4 officially supports Safari 16.4 and newer; the app's CSS was checked and its newer features (`@property`, `color-mix()`) sit behind `@supports` fallbacks. Newer features (`ImageCapture` from iOS 18.4, `navigator.audioSession` from iOS 17, wake lock from 16.4) are feature-detected.
- **Start-up fallback.** `src/app/layout.tsx` has a small ES5 script: if the app's code never starts (a phone too old for it, or a failed download), tapping Start says so aloud instead of doing nothing. The app sets `window.__docreaderReady` once it runs.
