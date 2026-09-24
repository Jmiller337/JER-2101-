# Progress

One entry per phase: what works, what is stubbed, and what changed from `PROMPT.md` and why.

## Phase 0: scaffold and plan

**Works.** Next.js 16.3 App Router project with TypeScript strict, Tailwind CSS v4, ESLint 9 with the Next.js rules, Vitest, and Playwright 1.56.1 configured for an iPhone viewport in Chromium with a fake camera. `output: "standalone"` so one build runs on Vercel, Fly.io, or any container. `/api/health` exists for the e2e server and container health checks. `CLAUDE.md`, `docs/PLAN.md`, `.env.example`.

**Changed from the prompt.** ESLint 9 and TypeScript 5.9 instead of the newest majors, and Playwright pinned; reasons are in `CLAUDE.md` under Assumptions.
