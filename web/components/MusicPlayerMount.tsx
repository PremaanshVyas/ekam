"use client";

import { usePathname } from "next/navigation";
import MusicPlayer from "@/components/MusicPlayer";

// Mount the player everywhere except the focused public share pages (/t/[id]).
export default function MusicPlayerMount() {
  const pathname = usePathname();
  if (pathname?.startsWith("/t/") || pathname?.startsWith("/admin")) return null;
  return <MusicPlayer />;
}
