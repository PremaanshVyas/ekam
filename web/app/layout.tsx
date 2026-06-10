import type { Metadata } from "next";
import type { Viewport } from "next";
import { Spectral, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import MusicPlayer from "@/components/MusicPlayer";

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Editorial dark system: Spectral (display), Inter (UI), IBM Plex Mono (labels/data).
const serif = Spectral({
  subsets: ["latin"], weight: ["300", "400", "500", "600"], style: ["normal", "italic"],
  variable: "--font-serif", display: "swap",
});
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://ekam.ink"),
  title: "ekam.ink",
  description:
    "576 strangers. One canvas. One moment in history. Claim a tile, hand-paint what home looks like, and your story lives on it forever.",
  openGraph: {
    title: "ekam.ink — 576 strangers. One canvas. One moment in history.",
    description:
      "Claim a tile. Hand-paint what home looks like. When it's complete, it becomes one artwork — and your story lives on it forever.",
    url: "https://ekam.ink",
    siteName: "ekam.ink",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ekam.ink — 576 strangers. One canvas. One moment in history.",
    description: "Claim a tile. Hand-paint what home looks like. Your story lives on it forever.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>{children}<MusicPlayer /></body>
    </html>
  );
}
