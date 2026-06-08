"use client";

import { useEffect, useRef, useState } from "react";

type Track = { title: string; artist: string; src: string };

// Fallback if /audio/playlist.json can't be read. The live playlist is curated in
// web/public/audio/playlist.json (see the README there — add your own tracks easily).
const DEFAULT: Track[] = [
  { title: "Groove Salad", artist: "ambient · downtempo", src: "https://ice1.somafm.com/groovesalad-128-mp3" },
  { title: "Fluid", artist: "instrumental hip-hop · lofi", src: "https://ice1.somafm.com/fluid-128-mp3" },
  { title: "Drone Zone", artist: "atmospheric ambient", src: "https://ice1.somafm.com/dronezone-128-mp3" },
  { title: "Lush", artist: "mellow · vocal chill", src: "https://ice1.somafm.com/lush-128-mp3" },
];

const iconBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--color-border-default)",
  background: "var(--color-bg-canvas)", color: "var(--color-text-primary)", cursor: "pointer",
  fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
};

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [tracks, setTracks] = useState<Track[]>(DEFAULT);
  const [open, setOpen] = useState(true);
  const [showList, setShowList] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [vol, setVol] = useState(0.7);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // Curated playlist (edit web/public/audio/playlist.json — no code needed).
  useEffect(() => {
    fetch("/audio/playlist.json")
      .then((r) => r.json())
      .then((d) => { if (Array.isArray(d) && d.length && d.every((t) => t?.src)) setTracks(d); })
      .catch(() => { /* keep DEFAULT */ });
  }, []);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = vol; }, [vol]);

  const track = tracks[idx] ?? tracks[0];
  const isSoma = !!track && track.src.includes("somafm");

  const start = (i: number) => {
    const a = audioRef.current; if (!a) return;
    setIdx(i);
    a.src = tracks[i].src;
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
  const next = () => start((idx + 1) % tracks.length);
  const prev = () => start((idx - 1 + tracks.length) % tracks.length);

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
        <div ref={cardRef} style={{ position: "fixed", ...place, zIndex: 60, width: 252, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 10, boxShadow: "0 12px 34px rgba(26,24,19,.18)", fontFamily: "var(--font-ui), sans-serif", overflow: "hidden" }}>
          <div onPointerDown={onDragStart} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "grab", borderBottom: "1px solid var(--color-border-default)", background: "var(--color-bg-surface)", touchAction: "none" }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--color-text-muted)" }}>♪ studio radio</span>
            <button onClick={() => setOpen(false)} aria-label="minimize player" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>–</button>
          </div>

          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, color: "var(--color-text-primary)", display: "flex", alignItems: "center", gap: 8 }}>
                {playing && <span className="pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--color-live)", display: "inline-block", flexShrink: 0 }} />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track?.title}</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track?.artist}</div>
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

            <button onClick={() => setShowList((s) => !s)} aria-expanded={showList} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 12, fontFamily: "var(--font-ui), sans-serif", textAlign: "left", padding: 0 }}>
              browse tracks ({tracks.length}) {showList ? "▴" : "▾"}
            </button>

            {showList && (
              <div style={{ maxHeight: 156, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid var(--color-border-default)", paddingTop: 6 }}>
                {tracks.map((t, i) => (
                  <button key={i} onClick={() => { start(i); setShowList(false); }} style={{ textAlign: "left", padding: "6px 8px", borderRadius: 6, border: "none", cursor: "pointer", background: i === idx ? "var(--color-bg-surface)" : "transparent" }}>
                    <div style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, fontWeight: i === idx ? 600 : 400, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                    <div style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 11, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.artist}</div>
                  </button>
                ))}
              </div>
            )}

            {isSoma && <div style={{ fontSize: 11, color: "var(--color-text-muted)", textAlign: "center" }}>ambient radio · via SomaFM ♥</div>}
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
