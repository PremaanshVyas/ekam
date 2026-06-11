"use client";

import { useEffect, useState } from "react";

// Live countdown ticking every second: "5d 14h 23m 45s". suppressHydrationWarning
// because the server snapshot and client mount land on different seconds.
export default function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const ms = Date.parse(to) - now;
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return <span>closed</span>;
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000),
    m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  const text = d > 0 ? `${d}d ${h}h ${m}m ${s}s` : h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
  return <span suppressHydrationWarning>{text}</span>;
}
