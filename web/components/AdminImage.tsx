"use client";

import { useState } from "react";

// Moderation thumbnail → click to view the tile's full-resolution painting in a lightbox.
export default function AdminImage({ img, base, size = 72 }: { img: string | null; base: string; size?: number }) {
  const [open, setOpen] = useState(false);
  const isHex = !!img && img.startsWith("#");
  const url = img && !isHex ? base + img : null;
  const thumb: React.CSSProperties = {
    width: size, height: size, flexShrink: 0, borderRadius: 4, border: "1px solid var(--color-border-default)",
    background: isHex ? img! : url ? `center/cover url("${url}")` : "var(--palette-paper)",
  };
  if (!url) return <div style={thumb} />;
  return (
    <>
      <button onClick={() => setOpen(true)} title="view full size" style={{ ...thumb, padding: 0, cursor: "zoom-in" }} />
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(8,6,3,.86)", backdropFilter: "blur(4px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, cursor: "zoom-out", padding: 24 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="tile, full size" style={{ width: "min(86vw, 86vh)", height: "auto", aspectRatio: "1 / 1", objectFit: "contain", borderRadius: 10, border: "1px solid var(--color-border-default)", background: "#f4eee2", boxShadow: "0 20px 60px rgba(0,0,0,.5)" }} />
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-2)" }}>click anywhere to close</span>
        </div>
      )}
    </>
  );
}
