# Setting up Document Reader

This guide takes you from this repository to the app running on the user's iPhone. It assumes no development experience. Allow about an hour the first time.

You will:

1. Get an Anthropic API key and choose a passcode.
2. Put the app on the internet with **Vercel** (simplest, free for personal use) or **Fly.io** (a small server, a few dollars a month).
3. Set up the iPhone.
4. Walk through the first use together.

---

## 1. What you need

- **An Anthropic API key.** Sign in at [platform.claude.com](https://platform.claude.com), open Settings, then API keys, and create a key. Add a payment method and a spending limit under Billing. Reading a page costs about 3 cents and a question about 1 cent, so 20 pages a day is well under a dollar. A monthly limit of 20 dollars is plenty.
- **A passcode** for the app. Make it at least 12 characters, for example three random words. It stops strangers who find the address from using your API key. You will type it once on the iPhone.
- **This repository on GitHub** (it already is: `Jmiller337/JER-2101-`). The code is on the branch `claude/jolly-planck-dldb0u`, which is currently the repository's default branch.

Keep the key and the passcode somewhere safe, such as a password manager. Never put them in the code or in a chat.

---

## 2. Put the app online

Pick **one** option.

### Option A: Vercel (recommended)

1. Go to [vercel.com](https://vercel.com) and sign up with your GitHub account. The free Hobby plan is for personal, non-commercial use, which this is.
2. Click **Add New…**, then **Project**. Find `JER-2101-` in the list and click **Import**. If it is not listed, click the link to adjust GitHub app permissions and give Vercel access to that repository.
3. Vercel detects Next.js. Leave the build settings as they are.
4. Open **Environment Variables** and add two:

   | Name | Value |
   |---|---|
   | `ANTHROPIC_API_KEY` | your API key |
   | `APP_PASSCODE` | your passcode |

5. Click **Deploy**. After a minute or two you get an address such as `https://jer-2101.vercel.app`. That is the app.
6. Check it: open the address on your computer. You should see a yellow button, "Start. Tap anywhere." Add `/api/health` to the address; it should show `{"ok":true}`.

Every change pushed to the default branch is deployed automatically. If you later move the code to a `main` branch, make `main` the default branch on GitHub or set it under the Vercel project's **Settings**, **Git**, **Production Branch**.

To change the passcode or key later: Vercel project, **Settings**, **Environment Variables**, edit, then **Deployments**, the newest one, **Redeploy**.

### Option B: Fly.io

Fly runs the app as a small always-available server. It needs a payment method and the `fly` command-line tool. The commands below are the standard ones; if one fails, check [fly.io/docs](https://fly.io/docs) because details change.

1. Install the tool. On a Mac: `brew install flyctl`. On Windows or Linux, follow "Install flyctl" on fly.io.
2. Sign up or sign in:

   ```
   fly auth signup
   ```

3. Download this repository to your computer (GitHub, **Code**, **Download ZIP**, then unzip), and open a terminal in that folder.
4. Open `fly.toml` in a text editor. Change `app = "document-reader-change-me"` to a name of your own, for example `app = "maria-reader"`. The app's address will be `https://maria-reader.fly.dev`. Optionally change `primary_region` to the nearest region (`fly platform regions` lists them).
5. Create the app and store the key and passcode as secrets (use your own values and the name from step 4):

   ```
   fly apps create maria-reader
   fly secrets set ANTHROPIC_API_KEY=your-key APP_PASSCODE=your-passcode --app maria-reader
   ```

6. Deploy:

   ```
   fly deploy
   ```

   This builds the app from the `Dockerfile` on Fly's servers and starts it. It takes a few minutes the first time.
7. Check it: open `https://maria-reader.fly.dev` and `https://maria-reader.fly.dev/api/health`.

The app stops itself when nobody is using it and starts again on the next visit, which costs almost nothing but makes the first page load after a pause take a few extra seconds. To keep it always ready, change `min_machines_running = 0` to `1` in `fly.toml` and run `fly deploy` again.

To change the passcode: `fly secrets set APP_PASSCODE=new-passcode --app maria-reader` (the app restarts by itself). To see what the app is doing: `fly logs --app maria-reader`.

### Optional: your own address

A short address is easier to say and type, for example `reader.yourname.dev`. Any domain works; `.dev` addresses are a good fit because they always use a secure connection, which the camera needs anyway.

1. Buy a domain from any registrar (for example Cloudflare, Namecheap, or Porkbun).
2. **Vercel:** project, **Settings**, **Domains**, add the domain, and create the DNS record Vercel shows at your registrar.
   **Fly.io:** run `fly certs add reader.yourname.dev --app maria-reader`, then create the DNS records it prints (or a CNAME to `maria-reader.fly.dev`).
3. Wait until the certificate is issued (usually minutes), then use the new address everywhere below.

If the app ever says "This page was opened from an address the app does not accept", add the address to an environment variable `ALLOWED_HOSTS` (for example `ALLOWED_HOSTS=reader.yourname.dev`) and redeploy. This is only needed behind unusual proxies.

---

## 3. Set up the iPhone

Do this together with the user.

1. **Open the address in Safari.** Not in Gmail, Facebook, or another app's built-in browser: those often cannot use the camera. If you send the link in a message, long-press it and choose **Open in Safari**.
2. **Start.** Tap the yellow button. The app asks: "Do you use VoiceOver?" Tap the top half of the screen for yes (VoiceOver users), the bottom half for no.
3. **Passcode.** Type the passcode and press Continue. The phone remembers it.
4. **Camera.** When Safari asks to use the camera, tap **Allow**. If you tapped Don't Allow by mistake: iPhone **Settings**, **Apps**, **Safari**, **Camera**, choose **Allow** (on older iOS: **Settings**, **Safari**, **Camera**).
5. **Add to the Home Screen.** In Safari tap the Share button, then **Add to Home Screen**. On iOS 26 and later, turn **Open as Web App** off before tapping Add, so the icon opens the app in Safari. (Opened as a separate web app, iOS forgets the camera permission every time and has had camera bugs.)
6. **A Siri shortcut** (so the user can say "Hey Siri, read a document"): open the **Shortcuts** app, tap **+**, **Add Action**, search for **Open URLs**, enter the app's address, and name the shortcut **Read a document**.
7. **A better voice** (read-aloud mode): iPhone **Settings**, **Accessibility**, **Spoken Content**, **Voices**, **English**, then pick a voice marked Enhanced or Premium (for example Ava or Zoe) and download it. The app picks it automatically. In the app's Settings you can choose a different voice and press Preview.
8. **Sound.** Turn the volume up. If nothing is heard with the ring/silent switch on silent, flip it to ring.

---

## 4. First use, together

Put a letter or bill on a table in good light.

1. Open the app from the Home Screen icon (or Siri). Tap anywhere to start.
2. The app says: "Lay the phone flat on the page, then lift it slowly…" Place the phone face up on the page, then lift it slowly, keeping it flat.
3. Listen to the guidance: "Move left", "Move away from you", "Lift the phone higher", and so on. When the whole page is visible it says "I see the whole page. Hold still." Hold still for a moment: the app makes a camera sound and says "Got it. Reading."
4. A few seconds later it says what the document is ("A water bill from…") and reads it. The yellow **Capture** button at the bottom of the screen takes the picture at once at any time.
5. While reading: **Pause**/**Play**, **Back** and **Forward** (one sentence), **Previous paragraph** and **Next paragraph**, **Spell** (spells the current sentence letter by letter), **Slower**, **Faster**.
6. **Add page** photographs the next page of the same letter. **Ask a question** answers questions such as "When is it due?" or "What number do I call?"; type it, or press **Talk** and say it. **New document** starts over (press it twice).

VoiceOver users: after choosing "I use VoiceOver" the app stays quiet and VoiceOver reads everything. When a page is ready, VoiceOver says "Page 1 ready… Swipe right to read." Swipe right to read paragraph by paragraph; the rotor's Headings option jumps between headings. "Play with app voice" lets the app read the document aloud with its own controls.

Then run through `docs/TESTING-ON-IPHONE.md` together and note anything that does not work.

---

## 5. Costs, speed, and the model

The app uses Claude Opus 5.5 (`claude-opus-5-5`) to read pages and answer questions. If reading feels slow, switch to the faster Claude Sonnet 5 by adding environment variables and redeploying:

| Name | Value |
|---|---|
| `READ_MODEL` | `claude-sonnet-5` |
| `ASK_MODEL` | `claude-sonnet-5` |

Remove them to go back. Sonnet 5 costs about half as much.

To measure speed and cost with a real photo, on a computer with Node.js 22 installed, in the repository folder:

```
npm install
ANTHROPIC_API_KEY=your-key npm run check:real-api path/to/photo.jpg
```

It prints when the title would start being spoken, the time to the first paragraph, the total time, tokens, and cost, then asks two questions.

The server logs one line per request with timings, token counts, and the outcome (never the document text): Vercel project, **Logs**; or `fly logs`.

---

## 6. Privacy

- Photos are sent to Anthropic's API to be read and are not stored by the app. Anthropic's documentation states that uploaded images are not used to train models; see Anthropic's privacy policy and commercial terms for how API data is retained.
- The app stores nothing on the server. The current document's text stays in the phone's browser for the session (so a reload does not lose it) and is cleared by **New document**. Settings and the passcode are kept on the phone.
- Anyone with the address **and** the passcode can use the app and your API key. Change the passcode if it may have been shared.

---

## 7. If something goes wrong

| What happens | What to do |
|---|---|
| "I can't use the camera…" | iPhone Settings, Apps, Safari, Camera: Allow. Then reload the page. |
| "Please open this page in Safari." | The link was opened inside another app. Open it in Safari. |
| "The reading service is not set up correctly…" | The API key or passcode environment variable is missing or wrong on Vercel or Fly. Fix it and redeploy. |
| "The passcode was not accepted." | The passcode was changed on the server. Type the new one. |
| "The reading service is busy…" or "overloaded" | Wait a minute and try again. If it keeps happening, check the spending limit on platform.claude.com. |
| No sound | Volume up, silent switch to ring, and check the app is not in VoiceOver mode (app Settings). |
| The first page takes a long time after a pause (Fly.io) | The server was asleep. See `min_machines_running` above. |
| Reading is slow | Switch to Claude Sonnet 5 (section 5). |
