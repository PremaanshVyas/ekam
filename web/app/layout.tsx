import type { Metadata } from "next";
import { Inter, Shantell_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const shantell = Shantell_Sans({ variable: "--font-shantell", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://ekam.ink"),
  title: "ekam.ink",
  description:
    "r/place was a battlefield. This is a quilt. One shared canvas, painted one tile at a time by hundreds of strangers.",
  openGraph: {
    title: "ekam.ink",
    description:
      "One shared canvas. Hundreds of strangers. Each claims one tile, hand-paints what home looks like, and leaves one line.",
    url: "https://ekam.ink",
    siteName: "ekam.ink",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ekam.ink",
    description: "r/place was a battlefield. This is a quilt.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${shantell.variable}`}>
      <body>{children}</body>
    </html>
  );
}
