# Document reader for a blind iPhone user

A mobile web app that lets a blind person read paper documents with their iPhone: hold the phone over the page, get spoken guidance until the page is in view, the app takes the photo, Claude reads it, and the phone reads it aloud with playback controls. Multi-page documents and questions about the document are supported.

## Status

The app has not been built yet. This repository currently holds the build specification.

- `PROMPT.md` is the complete build prompt, written for Claude Code. Open Claude Code in a checkout of this repository and paste the contents of that file (everything below its horizontal rule) as the first message. It contains every product decision, the spoken scripts, the API protocol, the Claude API configuration, hosting for Vercel and Fly.io, a phased build plan, and the testing and handover requirements.

## What you need before the build starts

- An Anthropic API key (console.anthropic.com).
- A place to deploy over HTTPS: a Vercel account (default) or a Fly.io account (alternative). The prompt asks the builder to produce a step-by-step setup guide for whichever you choose.
- An iPhone with Safari for the manual tests at the end; nothing in CI can run iOS Safari with a real camera and VoiceOver.
