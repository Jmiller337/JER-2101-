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
5. Honest about uncertainty: unclear words are announced, nothing is invented or summarized.
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
- **Framing thresholds** live in `FRAMING` in `src/lib/client/vision/framing.ts` and were tuned on synthetic frames and a generated video, not on a real iPhone. The ones most likely to need adjusting on the device are `motion` (hand tremor), `steadyMs`, and `tooSmallCoverage`.
- **Direction cues** assume the phone is held flat over a page on a table with its top edge pointing away from the user ("Move away from you" means toward the top of the phone). The sign must be confirmed on a real iPhone (see `docs/TESTING-ON-IPHONE.md`).
