# Testing on the iPhone

Nothing in automated testing runs iOS Safari with a real camera, real speech, and real VoiceOver. This checklist is for the owner and the user to run together on the user's iPhone after each deploy. It takes about 30 minutes. Write down anything that fails, with what was said on screen, and pass it back to whoever maintains the app.

Before starting:

- Deploy the app (see `docs/SETUP.md`) and open its address in **Safari** (not in another app's built-in browser).
- Have ready: a one-page printed letter or bill, a two-page letter, a handwritten note, and a table lamp.
- Turn the ring/silent switch to silent once during the test (step 5) to check that the app is still heard.

## 1. First launch, read-aloud mode (VoiceOver off)

- [ ] The page shows one large yellow button: "Start. Tap anywhere."
- [ ] Tapping it says: "Document Reader. Do you use VoiceOver? Tap the top half of the screen for yes, or the bottom half for no."
- [ ] Tapping the bottom half says "Read-aloud mode. I'll read everything to you." then "Enter the passcode, then press Continue."
- [ ] A wrong passcode says "That passcode is not right. Try again." The right one says "Passcode accepted."
- [ ] Safari asks for the camera after the app says "I need the camera to see the page. Tap Allow if your phone asks."
- [ ] The camera preview appears and the app says "Lay the phone flat on the page, then lift it slowly…"

## 2. Reading a page

- [ ] Hold the phone over the one-page letter and press Capture. The app says "Got it. Reading." and, within a few seconds, a one-sentence description of the document (for example "A water bill from…"), then starts reading.
- [ ] Note roughly how long it took from "Got it. Reading." to the first word of the description: ______ seconds.
- [ ] Silence never lasts more than about three seconds without a soft tick.
- [ ] Amounts, dates, and phone numbers are read exactly as printed.
- [ ] At the end: "End of document. Press Play to hear it again, Ask a question, or Add page."
- [ ] The sentence being read is highlighted in yellow and scrolls into view.

## 2a. Framing guidance and automatic capture

Hold the phone flat above the page on a table, top of the phone pointing away from you.

- [ ] With nothing under the camera the app says "I can't see a page. Lift the phone slowly."
- [ ] Slide the phone so the page is cut off on the left. The app says "Move left." Moving the phone to the left brings the page into view. Repeat for right ("Move right."), top ("Move away from you."), and bottom ("Move toward you."). **If any direction is backwards, write down which.**
- [ ] Held very close (page overflowing the screen): "Lift the phone higher." Held far away: "Move closer to the page."
- [ ] With the whole page in view while moving: "I see the whole page. Hold still." Held still for about a second, the app plays the shutter, says "Got it. Reading.", and reads the page. No button press needed.
- [ ] Cues are never faster than about one every one and a half seconds, and the same cue is not repeated within four seconds.
- [ ] In a dark room: "Too dark. Turn on a light." (or, on a phone whose browser allows the flashlight, "It's dark, so I turned on the light." and the flashlight comes on).
- [ ] A lamp reflecting on glossy paper: "Glare. Tilt the phone a little."
- [ ] Pressing Capture always takes the picture at once, even while guidance is talking.
- [ ] Settings, Automatic capture off: the app says "I see the whole page. Press Capture." instead of capturing.
- [ ] Settings, Guidance minimal: only "Hold still" and the shutter are heard.
- [ ] "Use phone camera instead" opens the iPhone's camera; after taking the photo and choosing "Use Photo", the app reads it.
- [ ] Open the app's link from inside another app (for example Gmail or Facebook). If the camera does not start, the app says "Please open this page in Safari." and "Use phone camera instead" still works.

## 3. Reading controls

- [ ] Pause says "Paused. Paragraph N of M." Play says "Resuming." and repeats the sentence it stopped in.
- [ ] Back and Forward move one sentence. Previous paragraph and Next paragraph move one paragraph.
- [ ] Spell spells the current sentence slowly ("capital R, I, V, …") and then stays paused.
- [ ] Slower and Faster say the new speed ("Speed 1.1.") and continue at that speed.
- [ ] With a Bluetooth keyboard: Space pauses and plays, the arrow keys move by sentence and paragraph.

## 4. Settings

- [ ] Settings pauses reading. Each change is spoken ("Speed 1.3.", "Automatic capture off…", "Sounds off.").
- [ ] The voice list shows the phone's voices. If an Enhanced or Premium voice is installed, "Automatic" uses it. Preview speaks a sample.
- [ ] "Back to reading" says "Resuming." and continues.
- [ ] Settings survive closing and reopening Safari.

## 5. Sound and the screen

- [ ] With the ring/silent switch on silent, speech and the soft sounds are still heard. (The app asks iOS to treat it like a media app. If it is silent in silent mode, note it.)
- [ ] The screen does not dim or lock while the camera is open or a page is being read.
- [ ] Lock the phone in the middle of reading, then unlock it. The app says "Paused. Press Play to continue." and Play continues from the same place.
- [ ] Take a phone call during reading (or ask someone to call). Afterwards the app is paused, not talking over itself.

## 6. VoiceOver mode (VoiceOver on)

Turn VoiceOver on (Settings, Accessibility, VoiceOver, or triple-click the side button if set up). In the app, open Settings and choose "VoiceOver (I use a screen reader)".

- [ ] After that choice, the app never speaks in its own voice. Everything is read by VoiceOver.
- [ ] Every button can be found by swiping and is read with a clear name ("Capture, button", "Back one sentence, button").
- [ ] After Capture, VoiceOver says the document description, then "Page 1 ready. N paragraphs. Swipe right to read." Focus is on the document title.
- [ ] Swiping right reads the page paragraph by paragraph. The rotor's Headings option jumps between headings.
- [ ] Unclear words are written as "(unclear word)" and doubtful ones as "(possibly)".
- [ ] "Play with app voice" starts the app's own reading for this document, and the reading controls appear.
- [ ] Nothing is announced twice.

## 7. Hard cases

- [ ] Handwritten note: the app reads it and marks doubtful words with "possibly".
- [ ] A page photographed in dim light: either it reads, or it says clearly what is wrong ("Too dark…").
- [ ] A page with part cut off: it reads what it can and warns that part is cut off.
- [ ] Something that is not a document (a hand, the table): it asks you to try again and says why.

## 8. Recording results

For each failed item write: the step, what was expected, what happened, and the exact words the app said. Also note the iPhone model and iOS version (Settings, General, About).
