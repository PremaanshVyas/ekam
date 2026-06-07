import type { Metadata } from "next";
import { Inter, Shantell_Sans } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const shantell = Shantell_Sans({ variable: "--font-shantell", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "What Home Looks Like",
  description:
    "r/place was a battlefield. This is a quilt. One shared canvas, painted one tile at a time by hundreds of strangers.",
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
