import type { Metadata } from "next";
import type { Viewport } from "next";
import { Spectral, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import MusicPlayerMount from "@/components/MusicPlayerMount";
import { Analytics } from "@vercel/analytics/next";

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#16110d" };

// Editorial dark system: Spectral (display), Inter (UI), IBM Plex Mono (labels/data).
const serif = Spectral({
  subsets: ["latin"], weight: ["300", "400", "500", "600"], style: ["normal", "italic"],
  variable: "--font-serif", display: "swap",
});
const sans = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://ekam.ink"),
  icons: {
    icon: [
      { url: "/brand/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/brand/apple-touch-icon.png" }],
  },
  title: "ekam.ink",
  description:
    "Leave the words. Draw the lines. Say what's in your mind. Claim a tile, paint your piece of one canvas, and your story lives on a canvas made by hundreds of strangers.",
  openGraph: {
    title: "ekam.ink · Leave the words. Draw the lines.",
    description:
      "Say what's in your mind. Claim a tile, paint your piece of one canvas, and when the wall completes it becomes one artwork with your story on it forever.",
    url: "https://ekam.ink",
    siteName: "ekam.ink",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ekam.ink · Leave the words. Draw the lines.",
    description: "Say what's in your mind. Claim a tile, paint your piece of one canvas, and your story lives on the wall forever.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supa = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        {supa && <link rel="preconnect" href={supa} crossOrigin="anonymous" />}
        {supa && <link rel="dns-prefetch" href={supa} />}
        {children}
        <MusicPlayerMount />
        <Analytics />
      </body>
    </html>
  );
}
