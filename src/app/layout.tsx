import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Document Reader",
  description: "Reads paper documents aloud.",
  applicationName: "Document Reader",
  // The home-screen name on iOS. No `capable`: the icon should open in Safari, not standalone.
  appleWebApp: { title: "Reader" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
