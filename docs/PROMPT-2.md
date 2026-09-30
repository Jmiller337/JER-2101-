# Build prompt, round 2: what the client asked for

Read `CLAUDE.md` and `PROMPT.md` first. This prompt changes the app after the first meeting with the person it is for. Where it disagrees with `PROMPT.md`, this prompt wins; update `PROMPT.md`, `CLAUDE.md`, and `docs/DESIGN.md` so they agree with it when you are done. Work on the branch named in the session, run `npm run lint && npm run typecheck && npm test && npm run build` and the e2e suite before every commit, never weaken a test to get green, and push when the round is complete.

## 1. Who she is

- Central vision is gone; a small outer crescent remains, cloudy and blurred. Colours make no difference to her. Nothing may depend on seeing the screen.
- She has memorised where things are. Her apps stay where they were when she could still see them. **From this round on, no control moves without the owner's sign-off.** This round moves nothing.
- She scans paper: receipts, bills, credit card statements, letters. Rarely emails.
- She deletes photos the moment she has used them. Privacy worries her: nothing of hers may be kept or leak.
- She would rather wait a moment for a careful answer than get a quick, wrong one.
- What she hates: being read at. The iPhone "rambles", "jumbles everything together", and "starts reading with very little sense". SeeingAI did not work for her at all. VoiceOver "generalises everything at once". She wants to ask for a thing and hear that thing, in short full sentences.

## 2. Decided by the owner

1. **Ask first, then read only that.** After a photo the app answers her question, or if she asked nothing, says what the document is in one sentence and asks what she wants to know. Play reads everything, as it does today.
2. **Hold anywhere on the screen to talk.** Press and hold, speak, let go. This is how she asks questions and gives commands. Every button still works.
3. **No offline work this round.** Reading needs the internet; leave it there.
4. **The photo is deleted the moment it has been read.** Questions use the text. The text lives only while the app is open.

## 3. Ask first, then read only that

### The flow

- Camera opens: *"Camera ready. Hold the screen and tell me what you want to know, or just take the picture."* After she has used hold-to-talk three times (a `talkLearned` setting, like `modesLearned`), shorten it to *"Camera ready."*
- She holds and says, for example, "the amount due". The app repeats it back in a few words, *"Amount due."*, and keeps it for the next photo. She can say more than one thing: "the amount and the due date".
- The picture is taken as it is today (automatically, or with Capture). Shutter, then *"Got it. Looking for the amount due."* instead of *"Got it. Reading."*
- The answer, in one or two short full sentences, from the page only: *"The amount due is 84 dollars and 12 cents, due October 28, 2026."* Then: *"Hold the screen to ask something else, or press Play to hear everything."*
- No question asked: shutter, *"Got it. Reading."*, then one sentence that says what it is, from whom, and its one headline fact (section 3, "Headline facts"): *"This is a water bill from Riverside Water Utility for October. The amount due is 84 dollars and 12 cents, due October 28."* Then: *"What do you want to know? Hold the screen to ask, or press Play to hear everything."*
- After that the app is silent until she does something. **The app never reads the whole document unless she presses Play or says "read everything".**
- On the reading screen, holding and asking works the same way and answers from the whole document (all pages). Follow-up questions keep their context, as Ask does today.

### The answer rules

- Facts come only from what is on the page. Never guessed, never filled in from context, never "usually". `[?]` and `[unclear]` rules from `PROMPT.md` and the gap-filling rule in `CLAUDE.md` apply: a partly readable amount is *"possibly 84 dollars and 12 cents; part of it is hard to read."*
- Not on the page: *"I can't find the amount due on this page."* Then: *"Try the other side of the page, or press Play to hear everything."*
- Short full sentences. No preamble, no "Sure", no restating the question, no "the document says". Numbers, dates, and money read out in words the voice says well (the reader already does this for the transcript; reuse it).
- When the question is broad ("what is this", "what does it want from me", "what do I need to do"), answer in at most three sentences, still only from the page.

### Headline facts, by kind of document

The one fact she would ask for first, used in the identification sentence when she asked nothing:

| Kind | Headline |
|---|---|
| Receipt | Where, the date, the total |
| Bill | The amount due and the due date |
| Credit card or bank statement | The balance, the minimum payment, and the due date |
| Letter or notice | Who it is from and what it asks her to do, in one sentence |
| Form | What it is and whether anything is due or must be signed |
| Prescription or medical | What it is and who from; no doses unless asked |
| Anything else | What it is and who it is from |

If the headline fact is not on the page, say what it is and stop.

### How to build it

- One model call, not two. Add `question?: string` to the read request. The read prompt gets the question and writes an `answer` event (or an `identify` event with the description sentence when there is no question) **before** the page's blocks, then the full page exactly as today, so Play works the moment the answer has been spoken. The parser and `src/lib/shared/protocol.ts` get the new event; `tests/unit/modelOutput.test.ts` and `tests/unit/prompts.test.ts` guard the rules above (answer before blocks; answer text only from the page; no preamble; the not-found line).
- Questions asked on the reading screen go through `/api/ask` as today.
- The scripted test model (`FAKE_MODEL=1`) must answer the fixture page's questions ("amount due", "who is it from", "due date", "what is this") and say not-found for something it does not have ("account number").
- `PROMPT.md` principle 5 becomes: *"Facts are never invented. Play reads every word; answers and the description sentence quote the page."* Remove "nothing is summarised" and say why.

## 4. Hold anywhere to talk

- On the camera and reading screens (and Ask and Settings, where it makes sense), pressing and holding for 400 ms starts listening: the app stops speaking, plays a short rising tone, and listens until she lets go (or 8 seconds). A falling tone on release. Sliding the finger away cancels. Taps, swipes, and buttons are unchanged; a hold on a button is a hold, not a press.
- Disable the long-press text selection and callout on iOS (`user-select: none`, `-webkit-touch-callout: none`) on those screens.
- What she said is repeated back in a few words before the app acts: *"Amount due."*, *"Reading everything."*, *"Opening the camera."* If nothing was heard: *"I didn't catch that. Hold the screen and try again."*
- Commands, matched loosely (a few words each, case and filler words ignored); anything else is a question:
  - "take a picture", "capture", "scan" → Capture
  - "read everything", "read it all", "read the whole thing" → Play from the start
  - "play", "pause", "stop" → the player
  - "next", "back", "forward", "next paragraph", "previous paragraph"
  - "faster", "slower"
  - "spell that"
  - "new document", "open the camera", "start again"
  - "add a page", "next page"
  - "settings"
  - "what did you say", "repeat" → says the last thing again
  - "help" → says the commands in one breath
- Unknown words that are not a question either: *"I heard: … I don't know that one. Say help for what you can say."*
- Recognition uses the browser's speech recognition, as Talk on the Ask screen does today (`src/lib/client/speech/recognition.ts`). It needs the internet, which is fine this round. If the browser has none: *"This phone can't hear me. Use the buttons, or type on the Ask screen."* said once per session.
- VoiceOver takes touches for itself, so hold-to-talk is for read-aloud mode. In VoiceOver mode the Talk button on Ask stays as it is, and a **Talk** button appears on the camera in the same spot as the Ask screen's Talk button; nothing else moves.
- Tests: unit tests for the command matcher and the hold timing (400 ms, 8 s cap, cancel on move); e2e tests with the fake speech recognition for: a question before capture that is answered after it; "read everything"; an unknown command; nothing heard; VoiceOver mode showing the Talk button and not listening on a hold.

## 5. Privacy

- The photo is dropped the moment its read finishes or fails (remove the in-memory JPEG from the page model; `docs/PROGRESS.md` says it was kept for image-aware questions, which are not being built). Retake and Add page already take a new photo.
- The document's text stays in `sessionStorage` while the app is open (so a reload keeps it) and is cleared by New document and when the tab closes. Nothing else is kept on the phone. The server keeps nothing and logs no document text (already true; say so in `docs/SETUP.md`).
- Settings gets a **Privacy** group with one row that reads this aloud when pressed (and that VoiceOver reads as text): *"This app saves nothing. Your photo is sent once to be read, then deleted from the phone. The words are kept only until you start a new document or close the app. Nothing is stored on the server."* Do not make claims about the reading service's own retention; the owner will add a sentence about that after checking its current policy.
- The first time the app is used, after the VoiceOver question and before the passcode, say the privacy statement once.

## 6. Voice: speed goes back to 1 every time

- Every time the app opens, the reading speed is 1.0. Faster, Slower, and the Settings slider last for this session only. The Settings footer says: *"Speed goes back to 1 each time the app opens."* Her daughter's 2x no longer sticks.
- Add **Tone** (the voice's pitch, 0.8 to 1.2 in steps of 0.1, saved) and **Volume** (0.5 to 1.0, saved; the phone's buttons still work) to the Voice group in Settings, each spoken on change like speed is (*"Tone 1.1."*, *"Volume 8."*). `src/lib/client/speech/speaker.ts` passes pitch and volume to every utterance.

## 7. Thoughtful answers

- Answers already use the model's thinking. Keep it. Whenever an answer has not started within 1.5 seconds, say *"Let me look."* once (principle 6: never more than three seconds of silence).
- Never answer a question with a guess to be fast.

## 8. Sounds instead of vibration

- Safari on iPhone gives websites no vibration, so the corner-vibration she asked for cannot be done. Instead: soft ticks that quicken as the page fills the frame, a clear two-note chime when the framing is right, and the shutter. Keep them under the Sounds switch. Say in `docs/PROGRESS.md` why there is no vibration.

## 9. Other apps, books, and pictures

- A web app cannot read what other apps show. What it can do: **Photos** mode reads a screenshot. Tell her so in the Photos mode line: *"Photos. Tap the bottom of the screen to choose a photo or a screenshot."*
- When a photo or screenshot has little or no text, the read prompt describes it in one or two plain sentences (what it shows, any text that is there), never guessing at who people are. This uses the same rules as reading: only what is visible.
- Books, medical apps, grocery apps: not this round. Note it in `docs/PROGRESS.md` under "What still needs the owner".

## 10. Testing with eyes closed

- Add to the top of `docs/TESTING-ON-IPHONE.md`: every item is checked with eyes closed, by someone who has not seen the screen that day. If a step cannot be done with eyes closed, it fails.
- Add sections for this round: ask-then-scan with a receipt, a bill, and a statement; hold-to-talk commands; the privacy statement; speed resetting after the app is closed and reopened; tone and volume.

## 11. Not in this round, and why

- **Offline reading.** Reading needs the model over the internet. (Decided by the owner.)
- **Vibration.** Not available to websites on iPhone. Sounds stand in.
- **Reading inside other apps.** Not possible from a web app. Screenshots through Photos are the way.
- **Always-on listening or a wake word.** A web app cannot listen in the background or while it speaks; hold-to-talk is the substitute.

## 12. Definition of done

- With eyes closed: open the app, hold and say "the amount due", take the picture of a bill, and hear the amount and due date in one sentence, then silence until you act. Press Play and hear everything. Hold and say "new document" and be back at the camera.
- A blank sheet, a wall, and a table are never photographed automatically (already true; keep the tests).
- Ask "the account number" on the water bill fixture and hear *"I can't find the account number on this page."*
- Close and reopen the app after setting speed 2: it reads at 1.
- Nothing is drawn over the camera picture, and no control has moved.
- `npm run lint && npm run typecheck && npm test && npm run build` and the e2e suite pass; the docs match the app.
