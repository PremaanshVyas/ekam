"use client";

import { useEffect, useState } from "react";

// Live "2d 13h" style countdown, ticking every 30s. suppressHydrationWarning because
// the server snapshot and client mount can land in different minutes.
export default function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  const ms = Date.parse(to) - now;
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return <span>closed</span>;
  const d = Math.floor(ms / 86400000), h = Math.floor((ms % 86400000) / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return <span suppressHydrationWarning>{d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`}</span>;
}
