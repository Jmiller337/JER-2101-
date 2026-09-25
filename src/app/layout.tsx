import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Document Reader",
  description: "Reads paper documents aloud.",
  applicationName: "Document Reader",
  // The home-screen name on iOS. `capable: false` matches the manifest's `display: "browser"`:
  // the icon opens the app in Safari, which keeps the camera permission between launches.
  appleWebApp: { capable: false, title: "Reader" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f4f4f0",
};

/**
 * Runs before the app's own code, in syntax every browser understands.
 * - Applies the saved colour theme before the first paint, so the page never flashes.
 * - Shows focus rings only to keyboard users (a Bluetooth keyboard); touch and VoiceOver users
 *   never see a box drawn around the heading the app moves focus to.
 * - If the app never starts (a phone too old for its code, or a download that failed), tapping
 *   Start explains that out loud instead of doing nothing. Once the app is running it sets
 *   `__docreaderReady` and this part stays out of the way.
 */
const STARTUP_FALLBACK = `(function () {
  var root = document.documentElement;
  try {
    var saved = JSON.parse(window.localStorage.getItem("docreader.settings.v1") || "null");
    if (saved && (saved.theme === "light" || saved.theme === "dark" || saved.theme === "contrast")) {
      root.setAttribute("data-theme", saved.theme);
    }
  } catch (e) {}
  document.addEventListener("keydown", function (event) {
    if (!event.metaKey && !event.ctrlKey && !event.altKey) root.setAttribute("data-keyboard", "1");
  }, true);
  document.addEventListener("pointerdown", function () { root.removeAttribute("data-keyboard"); }, true);
  var loadedAt = 0;
  var broken = false;
  window.addEventListener("load", function () { loadedAt = Date.now(); });
  window.addEventListener("error", function (event) {
    var target = event.target;
    if (target && target.tagName === "SCRIPT") broken = true;
    if (event.message && /SyntaxError/.test(event.message)) broken = true;
  }, true);
  function tell(text) {
    var region = document.getElementById("startup-status");
    if (!region) {
      region = document.createElement("div");
      region.id = "startup-status";
      region.setAttribute("role", "alert");
      region.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:50;padding:16px;background:#000;color:#ffe600;font:bold 24px/1.3 system-ui,sans-serif";
      document.body.appendChild(region);
    }
    region.textContent = text;
    try {
      var synth = window.speechSynthesis;
      if (synth && window.SpeechSynthesisUtterance) {
        synth.cancel();
        synth.speak(new window.SpeechSynthesisUtterance(text));
      }
    } catch (e) {}
  }
  document.addEventListener("click", function (event) {
    if (window.__docreaderReady) return;
    var node = event.target;
    while (node && node.nodeType === 1 && node.getAttribute("data-start") !== "1") node = node.parentNode;
    if (!node || node.nodeType !== 1) return;
    if (broken || (loadedAt && Date.now() - loadedAt > 2000)) {
      tell("This app could not start. Check the internet connection and reload the page. The app needs iOS 16 or newer.");
    } else {
      tell("Still loading. Tap again in a moment.");
    }
  }, true);
})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // The start-up script sets data-theme and data-keyboard on <html> before React loads.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: STARTUP_FALLBACK }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
