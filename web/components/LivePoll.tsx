"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Soft-refreshes the server data on an interval (and when the tab regains focus)
// so the canvas + counter update live as tiles get published — without a full
// reload, so the canvas keeps its zoom/pan.
export default function LivePoll({ intervalMs = 12000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);
  return null;
}
