"use client";

import { usePathname } from "next/navigation";
import Embers from "@/components/Embers";
import PaintCursor from "@/components/PaintCursor";

// Site-wide ambience: the warm ember field + the trailing paint cursor, on every page.
// Skipped only on /admin (the moderation tool — keep the artwork untinted by ember glints).
// While you draw, the full-screen studio (.studio-full, z-index 75, opaque) sits ABOVE both
// the trail (70) and the embers (1), so it covers them automatically — no carve-out needed.
export default function SiteAmbience() {
  const pathname = usePathname() || "";
  if (pathname.startsWith("/admin")) return null;
  // On /canvas the explorer renders its OWN ember field (above the wall, below the panels), and
  // the global one is hidden by CSS anyway — so don't mount a second, hidden embers canvas + rAF
  // loop there. The trailing paint cursor stays on every page (it skips touch internally).
  const onCanvas = pathname.startsWith("/canvas");
  return (
    <>
      {!onCanvas && <Embers density={0.00005} opacity={0.75} />}
      <PaintCursor />
    </>
  );
}
