# Document Reader

A mobile web app that lets a blind person read paper documents with an iPhone. Hold the phone over a page and the app guides you by voice ("Move left", "Hold still") until the whole page is in view, takes the photo itself, sends it to Claude to read, and reads the text aloud with playback controls. You can add more pages and ask questions about the document ("When is it due?").

It works with or without VoiceOver: in read-aloud mode the app speaks everything itself; in VoiceOver mode it stays quiet and VoiceOver reads a properly structured page.

## Documentation

| Document | For |
|---|---|
| [`docs/SETUP.md`](docs/SETUP.md) | Deploying (Vercel or Fly.io), setting up the iPhone, first use, costs, privacy, troubleshooting |
| [`docs/TESTING-ON-IPHONE.md`](docs/TESTING-ON-IPHONE.md) | The manual checklist to run on the real iPhone after each deploy |
| [`docs/PROGRESS.md`](docs/PROGRESS.md) | What was built in each phase, what changed from the spec and why, and what still needs the owner |
| [`PROMPT.md`](PROMPT.md) | The full product specification the app was built from |
| [`CLAUDE.md`](CLAUDE.md) | Conventions and commands for anyone (or any AI assistant) changing the code |
| [`docs/PLAN.md`](docs/PLAN.md) | The module breakdown |

## Quick start for developers

Requires Node.js 22.

```
npm install
cp .env.example .env.local   # then fill in ANTHROPIC_API_KEY and APP_PASSCODE
npm run dev                  # http://localhost:3000
```

The camera needs a secure connection, so to try it from a phone on the same network run `npm run dev:https` and open the `https://` address it prints.

| Command | What it does |
|---|---|
| `npm run lint`, `npm run typecheck`, `npm test` | Lint, types, unit and route tests |
| `npm run test:e2e` | Builds and runs Playwright tests against the production server with a fake camera, a fake speech engine, and a scripted model (no API key needed) |
| `npm run check:real-api` | Reads the test photo with the real API and prints timings and cost (needs `ANTHROPIC_API_KEY`) |

## How it works

- **Phone (Next.js, React, TypeScript):** camera and frame analysis in the browser, a speech engine built on the phone's own voices (`speechSynthesis`), and a single announcement channel that goes either to speech or to VoiceOver's live region.
- **Server (Next.js route handlers):** `/api/read` sends one photo to Claude (`claude-opus-5-5`) and streams the page back line by line so reading starts before the page is finished; `/api/ask` answers questions about the pages. The API key stays on the server; a passcode protects both routes.
