"use client";

import { useState } from "react";

// Share buttons for a published tile: X intent, copy link, download the PNG.
export default function ShareTile({ url, imageUrl, title }: { url: string; imageUrl: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [dl, setDl] = useState(false);
  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  };
  const download = async () => {
    setDl(true);
    try {
      const r = await fetch(imageUrl); const b = await r.blob(); const u = URL.createObjectURL(b);
      const a = document.createElement("a"); a.href = u; a.download = "my-tile-ekam.png"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u);
    } catch {}
    setDl(false);
  };

  return (
    <div className="share">
      <a className="share__btn share__btn--x" href={tweet} target="_blank" rel="noreferrer">Share on X</a>
      <button className="share__btn" onClick={copy}>{copied ? "link copied ✓" : "Copy link"}</button>
      {imageUrl && <button className="share__btn" onClick={download}>{dl ? "saving…" : "Download"}</button>}
    </div>
  );
}
