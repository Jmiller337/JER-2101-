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
- [ ] The camera preview appears and the app says "Camera ready."

## 2. Reading a page

- [ ] Hold the phone over the one-page letter and press Capture. The app says "Got it. Reading." and, within a few seconds, a one-sentence description of the document (for example "A water bill from…"), then starts reading.
- [ ] Note roughly how long it took from "Got it. Reading." to the first word of the description: ______ seconds.
- [ ] Silence never lasts more than about three seconds without a soft tick.
- [ ] Amounts, dates, and phone numbers are read exactly as printed.
- [ ] At the end: "End of document. Press Play to hear it again."
- [ ] The sentence being read is highlighted in yellow and scrolls into view.

## 2a. Framing guidance and automatic capture

Hold the phone flat above the page on a table, top of the phone pointing away from you.

- [ ] With nothing under the camera the app says "I can't see a page."
- [ ] Slide the phone so the page is cut off on the left. The app says "Move left." Moving the phone to the left brings the page into view. Repeat for right ("Move right."), top ("Move away from you."), and bottom ("Move toward you."). **If any direction is backwards, write down which.**
- [ ] Held very close (page overflowing the screen): "Lift the phone higher." Held far away: "Move closer to the page."
- [ ] With the whole page in view while moving: "I see the whole page. Hold still." Held still for about a second, the app plays the shutter, says "Got it. Reading.", and reads the page. No button press needed.
- [ ] Hold the phone too close (the page overflowing the screen) but still for about a second and a half: the app takes the picture anyway, and either reads the page or says what to change. Note roughly how long it waited: ______ seconds.
- [ ] A white box is drawn around the page on the screen and follows it as the phone moves. Turn the page at an angle: the box turns with it and its corners sit on the page's corners. **If the box sits off the page, note by how much and in which direction.**
- [ ] When the picture is taken the box turns green, then the app says "Got it. Reading."
- [ ] Hard framings: the page at an angle, the page cut off at one edge, the page small in the picture, a dim room with one lamp. In each, holding the phone still for a second or two takes the picture. Note any case where it never does: ______
- [ ] Hold the phone still over a page in the ordinary way for five seconds without pressing anything: the picture is taken. If it is not, note what the app said instead.
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
- [ ] At the fastest speed, Faster says "That is the fastest speed." and the reading carries on without stopping.
- [ ] With a Bluetooth keyboard: Space pauses and plays, the arrow keys move by sentence and paragraph.

## 3a. Several pages

- [ ] After page 1 has finished, press Add page. The camera screen says "Add page 2" and the app says "Add page 2.". After the capture it says "Page 2 added." and reads page 2.
- [ ] Start a new two-page letter. Press Add page while page 1 is still being read, capture page 2, and check that the app goes back to where it was on page 1, then says "Page 2." at the boundary and reads on.
- [ ] Pause shows the page: "Paused. Paragraph 2 of 5, page 2 of 2."
- [ ] Reload the page in Safari (or close and reopen the tab): after Start, the app says "Your document is still here…" and Play reads it.
- [ ] New document asks for a second press ("Press New document again to clear this document…") and only then clears it.

## 3a2. PDFs

Before starting, save a PDF to the iPhone's Files app (for example a bill emailed as a PDF: open the attachment, tap Share, then Save to Files).

- [ ] On the camera screen, swipe right to PDF (the app says "PDF. Tap the bottom of the screen to choose a file."), then tap the bottom of the screen. The file picker opens; choose the PDF.
- [ ] The app says "Got it. Reading the PDF.", then what the document is, then reads it.
- [ ] Between pages it says "Page 2.", and it reads to the end of the last page.
- [ ] Ask a question about something on the second page: the answer is right.
- [ ] Press Add page while the PDF is still being read: the app says "Wait a moment, I'm still reading the PDF."
- [ ] Choose a file that is not a PDF (a photo, for example): the app says it is not a PDF.

## 3b. Questions

- [ ] Ask a question: the app says "Ask your question, then press Send. Or press Talk and say it."
- [ ] Type "When is it due?" and press Send. The answer is spoken as it arrives, then "Ask another question, or press Back to reading."
- [ ] Press Talk, say a question, press "Stop and send". The app says "You asked: …" and answers. (If Talk says speech input is not available, use the keyboard's microphone key in the question box instead.)
- [ ] Ask something the document does not say ("What is my account password?"). The answer says it is not in the document.
- [ ] Ask a follow-up that depends on the previous answer ("And how can I pay it?"). The answer makes sense.
- [ ] In VoiceOver mode the answer is read by VoiceOver, not by the app voice.
- [ ] Back to reading continues reading if it was reading before.
- [ ] Ask a question and press Send again while the answer is still coming. The app says "I'm still answering…" and the second question stays in the box.
- [ ] Ask a question and lock the phone while the answer is being spoken. After unlocking, the app says "Here is the answer again." and repeats it (or "Still answering." and then the answer).
- [ ] Press Talk, then Back to reading before saying anything. Nothing is sent and the microphone stops.

## 4. Settings

- [ ] Settings pauses reading. Each change is spoken ("Speed 1.3.", "Automatic capture off…", "Sounds off.").
- [ ] The voice list shows the phone's voices. If an Enhanced or Premium voice is installed, "Automatic" uses it. Preview speaks a sample.
- [ ] If the Voice section shows "A nicer voice is available", download a voice as it says (Ava or Zoe, Enhanced or Premium). Afterwards the card is gone and Preview sounds noticeably better.
- [ ] "Back to reading" says "Resuming." and continues.
- [ ] Settings survive closing and reopening Safari.

## 4b. Simple screens

- [ ] While reading, New document and More float at the top, and the player at the bottom shows Back, a large round Play, Forward, and Ask a question below it. More opens a menu with the rest, and VoiceOver says "More, collapsed" or "expanded".
- [ ] The line above Play fills as the document is read. Table rows appear together on a rounded card, and a new page starts with a small "Page 2" label.
- [ ] On the camera screen only More, the mode strip (PDF, Camera, Photos), and the Capture panel show; More opens Use phone camera instead and Settings.

## 4c. Modes (like the iPhone's Camera)

- [ ] The first time the camera opens, the app says "Camera ready. Swipe left or right for PDF and Photos." After the first mode change it says only "Camera ready.".
- [ ] Swipe left anywhere on the screen: the strip moves to Photos (in yellow) and the app says "Photos. Tap the bottom of the screen to choose a photo." Swipe right twice: "Camera.", then "PDF. …". Swiping past either end says the current mode again.
- [ ] A swipe that starts on the Capture panel changes mode and does not take a picture.
- [ ] Tapping a mode's name does the same as swiping to it.
- [ ] In PDF or Photos, the app does not talk about the page or take a picture, even with a page in view. Back in Camera, guidance and automatic capture start again.
- [ ] Photos: tap the bottom of the screen, choose a photo or a screenshot from the library, and the app reads it.
- [ ] Pinch to zoom still works on the camera screen, and swiping up or down does nothing.

## 4a. Colours and focus

- [ ] Settings, Colours: Light, Dark, and Black and yellow each change the whole app at once and are remembered after closing Safari.
- [ ] No coloured rectangle appears around the headings or the Start button.
- [ ] The camera screen shows only the picture, More, a small status line, and the Capture panel.
- [ ] Settings, Colours, Automatic: switching the iPhone between light and dark mode changes the app to match.

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
- [ ] In Settings, turning Automatic capture on or off is read once by VoiceOver ("on" or "off"), and moving the speed slider reads the new speed once.
- [ ] On the camera screen, VoiceOver reads "Camera ready." before the first framing cue.
- [ ] VoiceOver finds the modes as tabs ("PDF, tab, 1 of 3"). Double-tapping one switches to it, VoiceOver says it is selected, and the app adds nothing of its own. (One-finger swipes belong to VoiceOver, so they move between items instead of changing mode; that is expected.)

## 7. Hard cases

- [ ] Handwritten note: the app reads it and marks doubtful words with "possibly".
- [ ] A page photographed in dim light: either it reads, or it says clearly what is wrong ("Too dark…").
- [ ] A page with part cut off: it reads what it can and says nothing about the photo.
- [ ] A full page of small print: the reading goes all the way to the last line, including footers and reference numbers.
- [ ] Something that is not a document (a hand, the table): it asks you to try again and says why.

## 7b. Hard conditions and filled-in words

- [ ] A letter in a dim room with the flashlight off: the app reads it. Note any facts (amounts, dates, names) it got wrong: ______
- [ ] A crumpled or folded letter: the app reads across the folds. Small words may be filled in, but no amount, date, or name is made up.
- [ ] A faded shop receipt: the prices are read, or said with "possibly" or "unclear word" when they cannot be made out.
- [ ] Cover part of a number with a finger: the app says "unclear word" or "possibly" for it, never a different number.
- [ ] Ask a question whose answer was hard to read: the answer says it was hard to read.

## 7a. Errors

- [ ] Turn on Airplane Mode and press Capture. After a short automatic retry the app says "I couldn't reach the reading service. Check your connection, then press Capture to try again." and the camera comes back. Turn Airplane Mode off and capture again.
- [ ] While a page is being read, turn on Airplane Mode. The part already read stays, reading stops, the app says "I couldn't read the rest of this page. Press Play to hear what I have, or Retake page to photograph it again.", and the screen says "The rest of this page could not be read."
- [ ] Turn Airplane Mode off and press Retake page. The camera says "Retake page 1" and "Page 1 again…". After the capture the new reading replaces the partial page (no extra page appears).
- [ ] Ask the owner to change the passcode on the server. The next capture says "The passcode was not accepted. Please enter it again." and shows the passcode screen.
- [ ] Open the app with the ring/silent switch on silent: speech is still heard (or note that it is not).
- [ ] With VoiceOver mode on, none of the errors above is spoken by the app's own voice; VoiceOver reads them.

## 8. Recording results

For each failed item write: the step, what was expected, what happened, and the exact words the app said. Also note the iPhone model and iOS version (Settings, General, About).
