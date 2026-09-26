# Design

Document Reader is a web app for iPhone that reads paper documents and PDFs aloud. The primary user is blind; a sighted helper may set it up. The core job: point the phone at a page and hear every word of it, then ask about it.

This spec follows the owner's design brief (Apple Human Interface style: content first, clarity, restraint, progressive disclosure). Where the brief and the user's needs disagree, the user's needs win:

| Brief | This app | Why |
|---|---|---|
| 4.5:1 text contrast | 7:1 for all text, in every theme | The user may have some remaining vision; 7:1 is the project rule (principle 8). |
| 44 by 44 pt targets | 64 pt for primary controls, 48 pt for the rest | Buttons are found by touch and memory, not by sight. |
| SF Symbols only | Inline line icons drawn to match | SF Symbols cannot be used on the web. Every icon is decorative and sits next to a visible text label. |
| Standard gestures only | One custom gesture: a sideways swipe between the camera's modes | The owner's decision, to match the iPhone's Camera. The modes are also tabs, because VoiceOver keeps one-finger swipes for itself. |
| Full Dynamic Type | Fixed, large sizes (body text 24 pt) | The reading sizes are already at the large end; scaling the whole layout with Dynamic Type is left for later. |
| Semantic system colours | Tokens named after them, four themes | Automatic (the default) follows the iPhone's light or dark mode; Light, Dark, and Black and yellow can be chosen in Settings. |

## Visual system

- **Material: Liquid Glass**, by the owner's choice, after iOS 26. A translucent, blurred, colour-boosted material with a sheen across its top, a rim of light brightest at the top left, and a soft shadow, for the control layer that floats above content: the reading toolbar, the navigation bars of Settings and Ask, the first-launch cards, and the camera's controls, which are always dark glass. Content is never glass, and glass never sits on glass: items inside a glass bar have no fill of their own. The primary action is tinted glass (the accent colour with the same light on it). Legibility wins over transparency: where text sits on glass, the glass is opaque enough (80 to 86%) for 7:1 over the worst backdrop, and `tests/unit/glass-contrast.test.ts` checks every such pair from the stylesheet's own values. With Reduce Transparency or Increase Contrast glass becomes solid; Black and yellow has no glass at all.
- **Type.** The system font (SF Pro on the iPhone). Large Title for screen titles (36 pt bold), Title for the document's section headings, Body for the transcript (24 pt), Headline for button labels (semibold), Footnote for group footers. Weight, not colour, carries emphasis.
- **Colour.** One accent (deep blue in Light, light blue in Dark, yellow in Black and yellow), used only for the one primary action and selected states. Red only for New document, the one destructive action. Everything else is label, secondary label, and clear glass. The first-launch screens sit on a soft wash of blue, pink, and green so the glass has colour to bend.
- **Buttons.** Capsules for one line, concentric rounded rectangles for taller ones. Tinted glass for the primary action, clear glass for the rest, and no fill for items inside a glass bar. Borders appear only in Black and yellow and with Increase Contrast, as iOS does.
- **Spacing.** 16 pt side margins, an 8 pt grid, continuous rounded corners that nest (a 20 pt card with 16 pt padding holds 12 pt-radius controls).
- **Motion.** Only to explain a change: a pressed control squashes slightly and springs back, the camera's mode lens slides to the chosen mode, the switch knob slides. Everything stops with Reduce Motion.

## Navigation

One model: a stack with the camera at its root. Start leads to the camera, whose modes (PDF, Camera, Photos) are one swipe apart; a capture, a PDF, or a photo leads to Reading; Ask and Settings open as modal screens with Done in the navigation bar. Everything the user does on a screen is also spoken, and every screen has exactly one heading level 1.

## Screens

### Start

1. **Goal.** Let iOS allow speech (it needs one tap) and begin.
2. **Hierarchy.** App mark and name (Title 1); one line of what it does (Body, secondary); the Start button, tinted glass filling the rest of the screen ("Start. Tap anywhere.", Large Title weight).
3. **Layout.** Name at the top inside the safe area, 16 pt margins; the button takes all remaining height, 32 pt corner radius.
4. **States.** Default; pressed (scales to 99%); loading on a slow connection (a tap says "Still loading. Tap again in a moment."); broken (a tap says the app could not start and why).
5. **Left out.** A welcome carousel or instructions: the first spoken question explains everything that is needed.

### First launch: Do you use VoiceOver?

1. **Goal.** Choose how the app talks: its own voice, or quiet for VoiceOver.
2. **Hierarchy.** The question (Large Title); how to answer (Body, secondary); two equal choices, "I use VoiceOver" on top and "Read aloud to me" below (Title 1), each with one line of explanation.
3. **Layout.** Two glass cards on the soft background, splitting the space under the title, matching the spoken instruction "top half for yes, bottom half for no".
4. **States.** Default, pressed. Asked only once; changeable in Settings.
5. **Left out.** A default choice in accent colour: neither answer is preferred.

### Passcode

1. **Goal.** Enter the passcode once; the phone remembers it.
2. **Hierarchy.** "Enter the passcode" (Large Title); the field and its label (Title 2); Continue (filled, primary); the error when wrong (Headline, accent).
3. **Layout.** A single glass card on the soft background; Continue is a tinted glass capsule.
4. **States.** Default; checking ("Checking…"); wrong ("That passcode is not right. Try again.", spoken and focused).
5. **Left out.** Settings on this screen: nothing there is needed before the passcode.

### Camera (home)

1. **Goal.** Get something to read with as little effort as possible: a page in front of the phone, a PDF, or a photo already on the phone.
2. **Hierarchy.** The live picture (content) filling the whole screen, with a box around a page that has writing on it; the mode strip, PDF, Camera, Photos (Headline, the selected one in yellow, as on the iPhone's Camera); the action under it, the one primary action (Title 1 label: Capture, Choose a PDF, or Choose a photo); the current cue ("I can't see a page.", "Hold still.") in a small capsule; More.
3. **Layout.** The picture fills the screen edge to edge, as in the iPhone's Camera, and every control floats over it on dark glass. The page box follows the page's four corners, tilted or not: a white line while the page is being lined up, a green line and a light green fill when the picture is taken. More is a glass capsule in the top-trailing corner (Use phone camera instead, Settings), and the status capsule is centred below it. Near the bottom, the modes sit in a glass capsule with a lens of lighter glass under the selected one, and under them is the action: a large clear area over the bottom quarter of the picture, easy to hit by touch, with the white shutter and its label on a glass capsule. A sideways swipe anywhere on the screen moves to the next mode, as on the iPhone's Camera; tapping a mode does the same. In PDF and Photos the picture gives way to a large icon and one line of text.
4. **States.** Starting ("Starting the camera…"); ready ("Camera ready." spoken, with "Swipe left or right for PDF and Photos." until the user has changed mode once, then cues as needed); page seen (white box); no writing in view, such as a blank sheet, a wall, or a table ("I can't see any writing.", no box, never photographed automatically); the page just read still in view after New document or Add page ("This is the page you just read.", not photographed again until the view changes); capturing (green box, "Capturing…", shutter dimmed); camera refused or unavailable (the action becomes "Use phone camera instead"); error (the message in yellow in the capsule, spoken); mode changed (the mode's name and what to do, spoken: "PDF. Tap the bottom of the screen to choose a file."; at either end a swipe says the current mode again). When adding or retaking a page, "Back to reading" appears top-leading and the app says "Add page 2." or "Retake page 1.". Pressing Capture always takes the picture, whatever the cue.
5. **Left out.** Any spoken or written instructions about where to put the phone, and the visible screen title: the picture, the page box, and one action are all a sighted helper needs, and the spoken cues cover the rest. Settings is not a mode: it is changed rarely, so it stays behind More.

### Reading

1. **Goal.** Listen to the document, move through it, and go on to the next thing.
2. **Hierarchy.** The document's title (Large Title) under a small tinted capsule with its kind and page count ("Bill · 1 page"); the text itself (Body; section headings as Title 2; the sentence being read highlighted in yellow); the player: a large round Play or Pause in tinted glass (the primary action), Back and Forward on either side, and a line showing how far through the document the reader is; Ask a question under the player; New document and More in the top corners.
3. **Layout.** Built like Apple's audio players, with the controls floating on glass over the text. The text runs in a single column with generous line height. Table rows and label-value lines sit together on one rounded card, like the rows of an iOS list; notes such as "A table with 2 rows" are plain captions in secondary colour; a new page starts with a small "Page 2" label and a hairline; unclear and doubtful words are small tinted capsules. At the top, New document (red icon) floats on the leading side and More on the trailing side, where the camera's More is; More opens a glass menu under it with Previous and Next paragraph, Spell, Slower, Faster, Add page, and Settings. At the bottom, the player is a glass panel inset 8 pt from the edges: the progress line, then Back, Play, and Forward with their labels on one line; Ask a question is a glass capsule below it. The text fades out under the floating controls instead of showing in the gaps. In VoiceOver mode there is no player: VoiceOver reads the text, and Play with app voice and Ask a question follow it; New document and More stay at the top (More holds Add page and Settings).
4. **States.** Waiting for the first line ("Reading the page. This takes a few seconds.", soft ticks); reading (the sentence highlighted and scrolled into view, the progress line moving); paused; ended ("End of document.", the line full); a page that stopped part way (a note on a card under it, and Retake page as a glass capsule above the player); empty (no text found, spoken).
5. **Left out.** A grid of equal tiles, borders beside table rows, and italic text: the old toolbar gave every control the same weight, so nothing led. Now Play leads, the next two actions are one step away, and everything used only occasionally is in More.

### Ask

1. **Goal.** Ask a question about the document and hear the answer.
2. **Hierarchy.** "Ask a question" (Large Title, in the navigation bar) with Done; the question field (Title 2 label); Send (filled, primary) and Talk; the questions and answers so far (Body, newest first).
3. **Layout.** A modal screen on the grouped background: the form on one card, the answers as cards below.
4. **States.** Empty; listening ("Stop and send"); answering ("Answering…", then the answer spoken sentence by sentence); refused while busy (the question stays in the box); error (spoken, shown under the form).
5. **Left out.** Suggested questions: they would add reading for VoiceOver and are rarely what the user wants to ask.

### Settings

1. **Goal.** Adjust speed, voice, colours, and camera behaviour, then return.
2. **Hierarchy.** "Settings" (Large Title, in the navigation bar) with Done; groups in order of use: Speed, Voice, Colours, Camera, Sounds, How the app talks to you. Each group has a header (Headline, secondary), rows (Title 3), and a footer where needed (Footnote).
3. **Layout.** An iOS grouped list: rounded cards on the grouped background, rows separated by hairlines, a checkmark on the selected row, switches on the trailing side.
4. **States.** Every change is spoken in read-aloud mode ("Speed 1.2.", "Dark colours."); with VoiceOver, switches and the slider are read by VoiceOver itself. A card appears in Voice when only a basic voice is installed.
5. **Left out.** "Forget passcode" and advanced options: the app already asks again if the passcode changes, and fewer rows are faster to hear.
