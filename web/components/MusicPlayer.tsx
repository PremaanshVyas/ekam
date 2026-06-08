"use client";

import { useEffect, useRef, useState } from "react";

// ── Playlist ────────────────────────────────────────────────────────────────
// Default: SomaFM commercial-free ambient/lofi stations (no files to host).
// To use your OWN royalty-free tracks instead (e.g. Pixabay — free, no attribution),
// drop MP3s into web/public/audio/ and swap the `src` values to "/audio/yourfile.mp3"
// (and set `live: false` so a progress position could be added later).
const TRACKS = [
  { title: "Groove Salad", desc: "chilled ambient · downtempo", src: "https://ice1.somafm.com/groovesalad-128-mp3", live: true },
  { title: "Fluid", desc: "instrumental hip-hop · lofi", src: "https://ice1.somafm.com/fluid-128-mp3", live: true },
  { title: "Drone Zone", desc: "atmospheric ambient", src: "https://ice1.somafm.com/dronezone-128-mp3", live: true },
  { title: "Lush", desc: "mellow, vocal chill", src: "https://ice1.somafm.com/lush-128-mp3", live: true },
];

const iconBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--color-border-default)",
  background: "var(--color-bg-canvas)", color: "var(--color-text-primary)", cursor: "pointer",
  fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
};

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [vol, setVol] = useState(0.7);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const track = TRACKS[idx];

  useEffect(() => { if (audioRef.current) audioRef.current.volume = vol; }, [vol]);

  const start = (i: number) => {
    const a = audioRef.current; if (!a) return;
    setIdx(i);
    a.src = TRACKS[i].src;
    setLoading(true);
    a.play().then(() => { setPlaying(true); setLoading(false); }).catch(() => { setPlaying(false); setLoading(false); });
  };
  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    if (!a.src) a.src = track.src;
    setLoading(true);
    a.play().then(() => { setPlaying(true); setLoading(false); }).catch(() => { setLoading(false); });
  };
  const next = () => start((idx + 1) % TRACKS.length);
  const prev = () => start((idx - 1 + TRACKS.length) % TRACKS.length);

  // Drag the card by its header.
  const onDragStart = (e: React.PointerEvent) => {
    const el = cardRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
    const move = (ev: PointerEvent) => {
      const x = Math.max(8, Math.min(window.innerWidth - rect.width - 8, ev.clientX - offX));
      const y = Math.max(8, Math.min(window.innerHeight - rect.height - 8, ev.clientY - offY));
      setPos({ x, y });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const place: React.CSSProperties = pos ? { left: pos.x, top: pos.y } : { right: 20, bottom: 20 };

  return (
    <>
      <audio ref={audioRef} preload="none" onPlaying={() => { setPlaying(true); setLoading(false); }} onPause={() => setPlaying(false)} onWaiting={() => setLoading(true)} onError={() => { setLoading(false); setPlaying(false); }} />

      {open ? (
        <div ref={cardRef} style={{ position: "fixed", ...place, zIndex: 60, width: 248, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 10, boxShadow: "0 12px 34px rgba(26,24,19,.18)", fontFamily: "var(--font-ui), sans-serif", overflow: "hidden" }}>
          <div onPointerDown={onDragStart} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "grab", borderBottom: "1px solid var(--color-border-default)", background: "var(--color-bg-surface)", touchAction: "none" }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--color-text-muted)" }}>♪ studio radio</span>
            <button onClick={() => setOpen(false)} aria-label="minimize player" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>–</button>
          </div>

          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                {playing && <span className="pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-live)", display: "inline-block" }} />}
                {track.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>{track.desc}</div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <button onClick={prev} aria-label="previous" style={iconBtn}>‹‹</button>
              <button onClick={toggle} aria-label={playing ? "pause" : "play"} style={{ ...iconBtn, width: 42, height: 42, background: "var(--palette-ink)", color: "var(--color-text-inverse)", border: "none", fontSize: 15 }}>{loading ? "…" : playing ? "❚❚" : "▶"}</button>
              <button onClick={next} aria-label="next" style={iconBtn}>››</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>vol</span>
              <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(parseFloat(e.target.value))} style={{ flex: 1, accentColor: "var(--palette-ink)" }} aria-label="volume" />
            </div>

            <div style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "center" }}>ambient radio · via SomaFM ♥</div>
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} aria-label="open music player" style={{ position: "fixed", right: 20, bottom: 20, zIndex: 60, width: 46, height: 46, borderRadius: "50%", background: "var(--palette-ink)", color: "var(--color-text-inverse)", border: "none", cursor: "pointer", boxShadow: "0 8px 24px rgba(26,24,19,.22)", fontSize: 18 }}>
          {playing ? "♪" : "♫"}
        </button>
      )}
    </>
  );
}
