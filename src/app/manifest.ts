import type { MetadataRoute } from "next";

/**
 * `display: "browser"` on purpose (PROMPT.md 6.12): a home-screen icon should open the app in
 * Safari, because standalone home-screen web apps on iOS forget the camera permission on every
 * launch and have had camera bugs in iOS 18 and 26.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Document Reader",
    short_name: "Reader",
    description: "Reads paper documents aloud.",
    start_url: "/",
    display: "browser",
    orientation: "portrait",
    background_color: "#0b0f1a",
    theme_color: "#0b0f1a",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
