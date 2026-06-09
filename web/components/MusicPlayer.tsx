"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Track = { title: string; artist: string; src: string };

const DEFAULT: Track[] = [
  { title: "Good Night", artist: "FASSounds", src: "/audio/fassounds-good-night-lofi-cozy-chill-music-160166.mp3" },
  { title: "Coverless Book", artist: "AmbientAudioVision", src: "/audio/ambientaudiovision-coverless-book-lofi-186307.mp3" },
  { title: "Lofi Beats", artist: "Mirostar", src: "/audio/mirostar-lofi-beats-531504.mp3" },
];

const iconBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--color-border-default)",
  background: "var(--color-bg-canvas)", color: "var(--color-text-primary)", cursor: "pointer",
  fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
};
const fmt = (s: number) => { if (!isFinite(s) || s < 0) return "0:00"; const m = Math.floor(s / 60); const ss = Math.floor(s % 60); return `${m}:${ss < 10 ? "0" : ""}${ss}`; };

const VIZ_W = 480, VIZ_H = 96, BARS = 32;

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const vizRef = useRef<HTMLCanvasElement | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const srcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const [tracks, setTracks] = useState<Track[]>(DEFAULT);
  const [open, setOpen] = useState(true);
  const [showList, setShowList] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [vol, setVol] = useState(0.7);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    fetch("/audio/playlist.json").then((r) => r.json())
      .then((d) => { if (Array.isArray(d) && d.length && d.every((t) => t?.src)) setTracks(d); })
      .catch(() => { /* keep DEFAULT */ });
  }, []);
  useEffect(() => { if (audioRef.current) audioRef.current.volume = vol; }, [vol]);

  const track = tracks[idx] ?? tracks[0];

  // ── Web Audio graph (created lazily on first play; source node is one-per-element) ──
  const ensureGraph = useCallback(() => {
    if (acRef.current || !audioRef.current) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      const ac = new AC();
      const src = ac.createMediaElementSource(audioRef.current);
      const an = ac.createAnalyser();
      an.fftSize = BARS * 2;
      an.smoothingTimeConstant = 0.8;
      src.connect(an); an.connect(ac.destination);
      acRef.current = ac; analyserRef.current = an; srcNodeRef.current = src;
    } catch { /* visualizer optional — audio still plays */ }
  }, []);

  const drawIdle = useCallback(() => {
    const cv = vizRef.current; const ctx = cv?.getContext("2d"); if (!cv || !ctx) return;
    ctx.clearRect(0, 0, VIZ_W, VIZ_H);
    const bw = VIZ_W / BARS;
    ctx.fillStyle = "rgba(26,24,19,0.13)";
    for (let i = 0; i < BARS; i++) { const h = 4 + ((i * 7) % 5); ctx.fillRect(i * bw + 1, VIZ_H - h, bw - 2, h); }
  }, []);

  const loop = useCallback(() => {
    const an = analyserRef.current; const cv = vizRef.current; const ctx = cv?.getContext("2d");
    if (!an || !cv || !ctx) { rafRef.current = requestAnimationFrame(loop); return; }
    const data = new Uint8Array(an.frequencyBinCount);
    an.getByteFrequencyData(data);
    ctx.clearRect(0, 0, VIZ_W, VIZ_H);
    // multi-colour spectrum across the bars (ekam's tile palette as a left→right rainbow)
    const grad = ctx.createLinearGradient(0, 0, VIZ_W, 0);
    const cols = ["#9C4A33", "#C76B4A", "#E0A33E", "#8A9A5B", "#4F6F52", "#6E94BE", "#4E5C8A", "#8A5A78"];
    cols.forEach((c, i) => grad.addColorStop(i / (cols.length - 1), c));
    ctx.fillStyle = grad;
    const bw = VIZ_W / BARS;
    for (let i = 0; i < BARS; i++) {
      const v = data[i] / 255;
      const h = Math.max(3, v * v * VIZ_H);
      ctx.fillRect(i * bw + 1, VIZ_H - h, bw - 2, h);
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    if (playing && open) { if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop); }
    else { if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } drawIdle(); }
    return () => { if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; } };
  }, [playing, open, loop, drawIdle]);
  useEffect(() => { drawIdle(); }, [drawIdle, open]);

  const play = (i: number) => {
    const a = audioRef.current; if (!a) return;
    ensureGraph(); acRef.current?.resume();
    setIdx(i); a.src = tracks[i].src; setCur(0);
    setLoading(true);
    a.play().then(() => { setPlaying(true); setLoading(false); }).catch(() => { setPlaying(false); setLoading(false); });
  };
  const toggle = () => {
    const a = audioRef.current; if (!a) return;
    ensureGraph(); acRef.current?.resume();
    if (playing) { a.pause(); setPlaying(false); return; }
    if (!a.src) a.src = track.src;
    setLoading(true);
    a.play().then(() => { setPlaying(true); setLoading(false); }).catch(() => { setLoading(false); });
  };
  const next = () => play((idx + 1) % tracks.length);
  const prev = () => play((idx - 1 + tracks.length) % tracks.length);
  const seek = (t: number) => { const a = audioRef.current; if (a && isFinite(t)) { a.currentTime = t; setCur(t); } };

  const onDragStart = (e: React.PointerEvent) => {
    const el = cardRef.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
    const move = (ev: PointerEvent) => {
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - rect.width - 8, ev.clientX - offX)),
        y: Math.max(8, Math.min(window.innerHeight - rect.height - 8, ev.clientY - offY)),
      });
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };

  const place: React.CSSProperties = pos ? { left: pos.x, top: pos.y } : { right: 20, bottom: 20 };

  return (
    <>
      <audio
        ref={audioRef} preload="none"
        onPlaying={() => { setPlaying(true); setLoading(false); }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onError={() => { setLoading(false); setPlaying(false); }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => next()}
      />

      {open ? (
        <div ref={cardRef} style={{ position: "fixed", ...place, zIndex: 60, width: 264, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, boxShadow: "0 14px 38px rgba(26,24,19,.20)", fontFamily: "var(--font-ui), sans-serif", overflow: "hidden" }}>
          <div onPointerDown={onDragStart} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "grab", borderBottom: "1px solid var(--color-border-default)", background: "var(--color-bg-surface)", touchAction: "none" }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--color-text-muted)" }}>♪ studio radio</span>
            <button onClick={() => setOpen(false)} aria-label="minimize player" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 18, lineHeight: 1, padding: "0 2px" }}>–</button>
          </div>

          {/* visualizer */}
          <canvas ref={vizRef} width={VIZ_W} height={VIZ_H} style={{ width: "100%", height: 46, display: "block", background: "var(--color-bg-canvas)" }} aria-hidden />

          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
            <div>
              <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track?.title}</div>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track?.artist}</div>
            </div>

            {/* progress / seek */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10, color: "var(--color-text-muted)", width: 28, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(cur)}</span>
              <input type="range" min={0} max={dur && isFinite(dur) ? dur : 0} step={0.1} value={cur} onChange={(e) => seek(parseFloat(e.target.value))} aria-label="seek" style={{ flex: 1, accentColor: "var(--palette-clay)" }} />
              <span style={{ fontSize: 10, color: "var(--color-text-muted)", width: 28, fontVariantNumeric: "tabular-nums" }}>{fmt(dur)}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <button onClick={prev} aria-label="previous" style={iconBtn} className="lift">‹‹</button>
              <button onClick={toggle} aria-label={playing ? "pause" : "play"} style={{ ...iconBtn, width: 44, height: 44, background: "var(--palette-ink)", color: "var(--color-text-inverse)", border: "none", fontSize: 15 }} className="lift">{loading ? "…" : playing ? "❚❚" : "▶"}</button>
              <button onClick={next} aria-label="next" style={iconBtn} className="lift">››</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>vol</span>
              <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(parseFloat(e.target.value))} aria-label="volume" style={{ flex: 1, accentColor: "var(--palette-ink)" }} />
            </div>

            <button onClick={() => setShowList((s) => !s)} aria-expanded={showList} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 12, fontFamily: "var(--font-ui), sans-serif", textAlign: "left", padding: 0 }}>
              browse tracks ({tracks.length}) {showList ? "▴" : "▾"}
            </button>
            {showList && (
              <div style={{ maxHeight: 152, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid var(--color-border-default)", paddingTop: 6 }}>
                {tracks.map((t, i) => (
                  <button key={i} onClick={() => { play(i); setShowList(false); }} style={{ textAlign: "left", padding: "6px 8px", borderRadius: 6, border: "none", cursor: "pointer", background: i === idx ? "var(--color-bg-surface)" : "transparent" }}>
                    <div style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, fontWeight: i === idx ? 600 : 400, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                    <div style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 11, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.artist}</div>
                  </button>
                ))}
              </div>
            )}
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
