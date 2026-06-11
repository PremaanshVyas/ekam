"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Keep the moderation queue fresh while the tab is open (judging-day second screen).
export default function AdminAutoRefresh({ seconds = 15 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) router.refresh(); }, seconds * 1000);
    const vis = () => { if (!document.hidden) router.refresh(); };
    document.addEventListener("visibilitychange", vis);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [router, seconds]);
  return null;
}
