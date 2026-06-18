"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Track = { title: string; artist: string; src: string };

const DEFAULT: Track[] = [
  { title: "Good Night", artist: "FASSounds", src: "/audio/fassounds-good-night-lofi-cozy-chill-music-160166.mp3" },
  { title: "Coverless Book", artist: "AmbientAudioVision", src: "/audio/ambientaudiovision-coverless-book-lofi-186307.mp3" },
  { title: "Lofi Beats", artist: "Mirostar", src: "/audio/mirostar-lofi-beats-531504.mp3" },
];

const iconBtn: React.CSSProperties = {
  width: 36, height: 36, borderRadius: "50%", border: "1px solid var(--color-border-default)",
  background: "var(--color-bg-canvas)", color: "var(--color-text-primary)", cursor: "pointer",
  fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
};
const fmt = (s: number) => { if (!isFinite(s) || s < 0) return "0:00"; const m = Math.floor(s / 60); const ss = Math.floor(s % 60); return `${m}:${ss < 10 ? "0" : ""}${ss}`; };

const VIZ_W = 480, VIZ_H = 96, BARS = 32;
// ekam's tile palette as a left→right rainbow across the bars
const VIZ_COLORS = ["#9C4A33", "#C76B4A", "#E0A33E", "#8A9A5B", "#4F6F52", "#6E94BE", "#4E5C8A", "#8A5A78"];

/* AUDIO ARCHITECTURE — read before changing.
 *
 * TWO <audio> elements, deliberately:
 *   1. audioRef  (data-role="out") — the audible player. Plays 100% NATIVELY (.play()/.volume).
 *      It is NEVER captured by Web Audio, so a wedged AudioContext can never silence it. This is
 *      the permanent fix for the "shows playing but silent after ~20 min idle" bug — the browser's
 *      native media stack survives backgrounding, long idle, and output-device changes.
 *   2. vizAudioRef (data-role="viz") — a SILENT twin of the same track, routed through
 *      createMediaElementSource → analyser → gain(0) → destination. It makes no sound (gain 0,
 *      and being captured it has no native output), and only exists to drive the REAL,
 *      music-synced equalizer. If its context ever dies, only the bars are affected — audio is
 *      a separate native element and keeps playing.
 *
 * Why not a single element? createMediaElementSource captures an element's output permanently
 * (it can never play natively again) and ties it to a fragile context → the original silent bug.
 * Why not captureStream on the audible element? In real Chrome the captureStream → MediaStreamSource
 * → analyser path frequently delivers silence (works in headless, faux in the wild), so the
 * music-synced bars never showed. createMediaElementSource on the silent twin is the analyser path
 * that reliably produces real spectrum data on every browser (incl. Safari).
 *
 * INVARIANT: only the "viz" element may be captured by createMediaElementSource. NEVER capture,
 * GainNode-route, or rebuild the "out" element — that reintroduces the silent-after-idle bug.
 * Volume is native on the audible element (iOS ignores it — slider is a no-op there, hardware only). */
export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);     // audible, native — never touched by Web Audio
  const vizAudioRef = useRef<HTMLAudioElement | null>(null);  // silent twin — feeds the analyser
  const cardRef = useRef<HTMLDivElement | null>(null);
  const vizRef = useRef<HTMLCanvasElement | null>(null);

  // analysis graph (visualizer) — fed ONLY by the silent twin, never the audible element.
  const acRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const srcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const vizTriedRef = useRef(false);          // graph setup attempted (don't re-capture the twin)
  const vizOkRef = useRef(false);             // twin is captured + silenced → safe to play it
  const lastRealAtRef = useRef(0);            // last time the analyser had live data (seconds)
  const energyRef = useRef(0);                // eased 0..1 for the faux fallback animation

  const [tracks, setTracks] = useState<Track[]>(DEFAULT);
  const [open, setOpen] = useState(false); // opens on mount for desktop only — on phones the card would cover the canvas
  const [showList, setShowList] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [vol, setVol] = useState(0.7);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const playingRef = useRef(false); playingRef.current = playing;

  useEffect(() => {
    fetch("/audio/playlist.json").then((r) => r.json())
      .then((d) => { if (Array.isArray(d) && d.length && d.every((t) => t?.src)) setTracks(d); })
      .catch(() => { /* keep DEFAULT */ });
    // ignore near-zero saved volumes — a stored 0 from an old build would mute invisibly
    try { const v = parseFloat(localStorage.getItem("ekam.vol") || ""); if (isFinite(v) && v >= 0.05 && v <= 1) setVol(v); } catch { /* default */ }
    if (window.innerWidth >= 900) setOpen(true);
  }, []);

  // Native volume on the AUDIBLE element (it isn't captured, so element.volume works).
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = vol;
    try { localStorage.setItem("ekam.vol", String(vol)); } catch { /* fine */ }
  }, [vol]);

  const track = tracks[idx] ?? tracks[0];

  // Build the analysis graph off the SILENT twin. Created synchronously inside the play gesture
  // so the context can reach "running" (a context made/resumed outside a gesture stays suspended
  // → analyser reads zeros → faux bars). createMediaElementSource is one-per-element; the twin is
  // stable so this runs once. The twin is silent (it's captured + gain 0), so this never makes sound.
  const ensureVizGraph = useCallback(() => {
    if (acRef.current) { acRef.current.resume?.().catch(() => {}); return; }
    if (vizTriedRef.current) return;            // tried already — don't re-capture the twin
    const v = vizAudioRef.current; if (!v) return;
    vizTriedRef.current = true;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const src = ctx.createMediaElementSource(v);
      const an = ctx.createAnalyser();
      an.fftSize = BARS * 2; an.smoothingTimeConstant = 0.8;
      const g = ctx.createGain(); g.gain.value = 0; // the twin must stay SILENT
      src.connect(an); an.connect(g); g.connect(ctx.destination);
      acRef.current = ctx; analyserRef.current = an; srcNodeRef.current = src; gainRef.current = g;
      vizOkRef.current = true;                   // capture succeeded → the twin is now silent
      ctx.resume?.().catch(() => {});
    } catch { /* capture failed → vizOkRef stays false: the twin is NEVER played (no echo), faux bars */ }
  }, []);

  // keep the silent twin tracking the audible element (track + rough position + play/pause).
  // ONLY drives the twin once it's confirmed captured + silenced — otherwise playing it would
  // produce an audible second copy (echo). When not OK, the bars use the faux fallback instead.
  const syncViz = useCallback(() => {
    const a = audioRef.current, v = vizAudioRef.current;
    if (!a || !v || !vizOkRef.current) return;
    try {
      if (a.src && v.src !== a.src) v.src = a.src;
      if (Math.abs((v.currentTime || 0) - (a.currentTime || 0)) > 0.25) v.currentTime = a.currentTime || 0;
      if (a.paused) { if (!v.paused) v.pause(); } else if (v.paused) v.play().catch(() => {});
    } catch { /* viz only */ }
  }, []);

  // draw ONE visualizer frame — real spectrum when the analyser is live, else a faux animation.
  const drawFrame = useCallback(() => {
    const cv = vizRef.current; const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    ctx.clearRect(0, 0, VIZ_W, VIZ_H);
    const now = performance.now() / 1000;
    // energy eases in while playing, out while paused, so the bars settle instead of lying
    energyRef.current += ((playingRef.current ? 1 : 0) - energyRef.current) * 0.08;
    const e = energyRef.current;

    let data: Uint8Array | null = null;
    const an = analyserRef.current;
    if (an) {
      const d = new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(d);
      let sum = 0; for (let i = 0; i < d.length; i++) sum += d[i];
      if (sum > 0) lastRealAtRef.current = now;
      if (now - lastRealAtRef.current < 2) data = d; // recent live data → use it
    }

    const grad = ctx.createLinearGradient(0, 0, VIZ_W, 0);
    VIZ_COLORS.forEach((c, i) => grad.addColorStop(i / (VIZ_COLORS.length - 1), c));
    ctx.fillStyle = grad;
    const bw = VIZ_W / BARS;
    for (let i = 0; i < BARS; i++) {
      let h;
      if (data) {
        h = Math.max(3, (data[i] / 255) ** 2 * VIZ_H);
      } else {
        // faux fallback: layered sines, center-weighted like a spectrum, scaled by eased energy
        const env = 0.45 + 0.55 * Math.sin(((i + 0.5) / BARS) * Math.PI);
        const w1 = 0.5 + 0.5 * Math.sin(now * 2.3 + i * 0.55);
        const w2 = 0.5 + 0.5 * Math.sin(now * 3.9 + i * 0.31 + 2.0);
        const v = w1 * 0.65 + w2 * 0.35;
        h = 3 + e * env * v * (VIZ_H - 6);
      }
      ctx.fillRect(i * bw + 1, VIZ_H - h, bw - 2, h);
    }
  }, []);

  // run the viz loop only while the card is open (the canvas only exists then)
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const loop = () => { drawFrame(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open, drawFrame]);

  // Returning to the tab: native audio needs nothing. Resume the viz context + resync the silent
  // twin so the bars wake up in step. None of this can affect the audible element.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      acRef.current?.resume?.().catch(() => {});
      if (playingRef.current) syncViz();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("pageshow", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); window.removeEventListener("pageshow", onVis); };
  }, [syncViz]);

  const startPlayback = useCallback(async () => {
    const a = audioRef.current; if (!a) return;
    ensureVizGraph();                       // sync, inside the gesture → context can run
    acRef.current?.resume?.().catch(() => {});
    setLoading(true);
    syncViz();                              // start the silent twin alongside
    try {
      await a.play();
      setPlaying(true); setLoading(false);
      acRef.current?.resume?.().catch(() => {});
      syncViz();
    } catch { setPlaying(false); setLoading(false); }
  }, [ensureVizGraph, syncViz]);

  const play = useCallback(async (i: number) => {
    const a = audioRef.current; if (!a) return;
    setIdx(i); setCur(0);
    a.src = tracks[i].src;
    await startPlayback();
  }, [tracks, startPlayback]);

  const toggle = useCallback(async () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); try { vizAudioRef.current?.pause(); } catch {} setPlaying(false); return; }
    if (!a.src) a.src = track.src;
    await startPlayback();
  }, [playing, track, startPlayback]);

  const next = useCallback(() => play((idx + 1) % tracks.length), [play, idx, tracks.length]);
  const prev = useCallback(() => play((idx - 1 + tracks.length) % tracks.length), [play, idx, tracks.length]);
  const seek = (t: number) => {
    const a = audioRef.current; if (a && isFinite(t)) { a.currentTime = t; setCur(t); }
    const v = vizAudioRef.current; if (v && isFinite(t)) { try { v.currentTime = t; } catch { /* viz only */ } }
  };

  const onDragStart = (e: React.PointerEvent) => {
    const el = cardRef.current; if (!el) return;
    // a drag must never start a text selection sweep across the page underneath
    e.preventDefault();
    const prevSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    (document.body.style as unknown as Record<string, string>).webkitUserSelect = "none";
    window.getSelection()?.removeAllRanges();
    const rect = el.getBoundingClientRect();
    const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      setPos({
        x: Math.max(8, Math.min(window.innerWidth - rect.width - 8, ev.clientX - offX)),
        y: Math.max(8, Math.min(window.innerHeight - rect.height - 8, ev.clientY - offY)),
      });
    };
    const up = () => {
      document.body.style.userSelect = prevSelect;
      (document.body.style as unknown as Record<string, string>).webkitUserSelect = prevSelect;
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  };

  const place: React.CSSProperties = pos ? { left: pos.x, top: pos.y } : { right: 14, bottom: "calc(14px + env(safe-area-inset-bottom))" };

  return (
    <>
      {/* audible player — native output, never captured by Web Audio */}
      <audio
        ref={audioRef} data-role="out" preload="none"
        onPlaying={() => { setPlaying(true); setLoading(false); }}
        onPause={() => { setPlaying(false); try { vizAudioRef.current?.pause(); } catch {} }}
        onWaiting={() => setLoading(true)}
        onError={() => { setLoading(false); setPlaying(false); }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onEnded={() => next()}
      />
      {/* silent twin — feeds the analyser only; makes no sound (captured + gain 0) */}
      <audio ref={vizAudioRef} data-role="viz" preload="none" aria-hidden tabIndex={-1} />

      {open ? (
        <div ref={cardRef} style={{ position: "fixed", ...place, zIndex: 27, width: "min(272px, calc(100vw - 20px))", background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, boxShadow: "0 14px 38px rgba(0,0,0,.35)", fontFamily: "var(--font-ui), sans-serif", overflow: "hidden" }}>
          <div onPointerDown={onDragStart} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", cursor: "grab", borderBottom: "1px solid var(--color-border-default)", background: "var(--color-bg-surface)", touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--color-text-muted)" }}>♪ studio radio</span>
            <button onClick={() => setOpen(false)} aria-label="Minimize player" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", fontSize: 18, lineHeight: 1, padding: "2px 8px" }}>–</button>
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
              <input type="range" min={0} max={dur && isFinite(dur) ? dur : 0} step={0.1} value={cur} onChange={(e) => seek(parseFloat(e.target.value))} aria-label="Seek" style={{ flex: 1, accentColor: "var(--accent)", height: 24 }} />
              <span style={{ fontSize: 10, color: "var(--color-text-muted)", width: 28, fontVariantNumeric: "tabular-nums" }}>{fmt(dur)}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14 }}>
              <button onClick={prev} aria-label="Previous track" style={iconBtn} className="lift">‹‹</button>
              <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} style={{ ...iconBtn, width: 46, height: 46, background: "var(--accent)", color: "#16110d", border: "none", fontSize: 15 }} className="lift">{loading ? "…" : playing ? "❚❚" : "▶"}</button>
              <button onClick={next} aria-label="Next track" style={iconBtn} className="lift">››</button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>vol</span>
              <input type="range" min={0} max={1} step={0.01} value={vol} onChange={(e) => setVol(parseFloat(e.target.value))} aria-label="Volume" style={{ flex: 1, accentColor: "var(--accent)", height: 24 }} />
            </div>

            <button onClick={() => setShowList((s) => !s)} aria-expanded={showList} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-secondary)", fontSize: 12, fontFamily: "var(--font-ui), sans-serif", textAlign: "left", padding: "4px 0" }}>
              browse tracks ({tracks.length}) {showList ? "▴" : "▾"}
            </button>
            {showList && (
              <div style={{ maxHeight: 152, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, borderTop: "1px solid var(--color-border-default)", paddingTop: 6 }}>
                {tracks.map((t, i) => (
                  <button key={i} onClick={() => { play(i); setShowList(false); }} style={{ textAlign: "left", padding: "8px 8px", borderRadius: 6, border: "none", cursor: "pointer", background: i === idx ? "var(--color-bg-surface)" : "transparent" }}>
                    <div style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, fontWeight: i === idx ? 600 : 400, color: "var(--color-text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                    <div style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 11, color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.artist}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <button onClick={() => setOpen(true)} aria-label="Open music player" style={{ position: "fixed", right: 14, bottom: "calc(14px + env(safe-area-inset-bottom))", zIndex: 27, width: 48, height: 48, borderRadius: "50%", background: "var(--accent)", color: "#16110d", border: "none", cursor: "pointer", boxShadow: "0 8px 24px rgba(0,0,0,.4)", fontSize: 18 }}>
          {playing ? "♪" : "♫"}
        </button>
      )}
    </>
  );
}
