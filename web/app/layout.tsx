import type { Metadata } from "next";
import type { Viewport } from "next";
import { Inter, Fraunces } from "next/font/google";
import "./globals.css";

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const inter = Inter({ variable: "--font-ui", subsets: ["latin"] });
const display = Fraunces({ variable: "--font-display", subsets: ["latin"], axes: ["opsz", "SOFT", "WONK"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://ekam.ink"),
  title: "ekam.ink",
  description:
    "576 strangers. One canvas. One moment in history. Claim a tile, hand-paint what home looks like, and your story lives on it forever.",
  openGraph: {
    title: "ekam.ink — 576 strangers. One canvas. One moment in history.",
    description:
      "Claim a tile. Hand-paint what home looks like within the canvas palette. When it's complete, it becomes one artwork — and your story lives on it forever.",
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
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
