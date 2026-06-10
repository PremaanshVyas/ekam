"use client";

import { useState } from "react";

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
);
const IgIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <rect x="2.5" y="2.5" width="19" height="19" rx="5.2" />
    <circle cx="12" cy="12" r="4.3" />
    <circle cx="17.6" cy="6.4" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);
const WaIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.821 11.821 0 018.413 3.488 11.821 11.821 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.607zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.017-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" /></svg>
);

// Share a published tile: X + Instagram + WhatsApp boxes, plus copy link / download.
export default function ShareTile({ url, imageUrl, title }: { url: string; imageUrl: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [dl, setDl] = useState(false);
  const x = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
  const wa = `https://wa.me/?text=${encodeURIComponent(title + " " + url)}`;

  const copy = async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {} };
  const download = async () => {
    if (!imageUrl) return; setDl(true);
    try { const r = await fetch(imageUrl); const b = await r.blob(); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = "my-tile-ekam.png"; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(u); } catch {}
    setDl(false);
  };
  // Instagram has no web post URL: use the device share sheet (IG appears there on mobile),
  // otherwise download the image so it can be posted to IG manually.
  const insta = async () => {
    if (typeof navigator !== "undefined" && navigator.share) { try { await navigator.share({ title, text: title, url }); return; } catch {} }
    if (imageUrl) { await download(); alert("Image saved. Open Instagram and post it 💛"); } else { copy(); }
  };

  return (
    <div className="share">
      <div className="share__icons">
        <a className="share__ic share__ic--x" href={x} target="_blank" rel="noreferrer" title="Share on X" aria-label="Share on X"><XIcon /></a>
        <button type="button" className="share__ic share__ic--ig" onClick={insta} title="Share to Instagram" aria-label="Share to Instagram"><IgIcon /></button>
        <a className="share__ic share__ic--wa" href={wa} target="_blank" rel="noreferrer" title="Share on WhatsApp" aria-label="Share on WhatsApp"><WaIcon /></a>
      </div>
      <div className="share__util">
        <button className="share__btn" onClick={copy}>{copied ? "link copied ✓" : "Copy link"}</button>
        {imageUrl && <button className="share__btn" onClick={download}>{dl ? "saving…" : "Download"}</button>}
      </div>
    </div>
  );
}
