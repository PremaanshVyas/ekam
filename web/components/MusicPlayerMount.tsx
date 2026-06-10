"use client";

import { usePathname } from "next/navigation";
import MusicPlayer from "@/components/MusicPlayer";

// The player stays MOUNTED everywhere (so music never stops on navigation) and is
// only visually hidden on the focused share pages + the moderation tool.
export default function MusicPlayerMount() {
  const pathname = usePathname();
  const hidden = pathname?.startsWith("/t/") || pathname?.startsWith("/admin");
  return <div className="mp-root" style={hidden ? { display: "none" } : undefined}><MusicPlayer /></div>;
}
