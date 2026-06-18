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
 * Audio output is 100% the NATIVE <audio> element (.play()/.pause()/.volume). The browser's
 * media stack survives tab backgrounding, long idle, and output-device changes — unlike a Web
 * Audio graph. The old player routed output through createMediaElementSource → … → destination;
 * after a long idle the AudioContext wedges (clock still runs, so the equalizer animated) while
 * its output sink died → "playing" + moving bars + NO SOUND, and a captured element can never
 * fall back to native playback. That whole class of bug is gone here.
 *
 * The visualizer uses a SEPARATE, analysis-only graph fed by audio.captureStream() (which does
 * NOT redirect the element's output). It connects analyser → gain(0) → destination only to keep
 * the analyser "pulled"; it is silent and can never affect what you hear. If captureStream is
 * unavailable (Safari/iOS) or stops feeding, the bars fall back to a faux animation. Audio is
 * never involved in any of that.
 *
 * DO NOT reintroduce createMediaElementSource / GainNode-for-volume / rebuild-on-idle here. */
export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const vizRef = useRef<HTMLCanvasElement | null>(null);

  // analysis-only graph (visualizer). NEVER in the audio output path.
  const acRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const wiredRef = useRef(false);             // captureStream → analyser is wired
  const lastRealAtRef = useRef(0);            // last time the analyser had live data (seconds)
  const energyRef = useRef(0);                // eased 0..1 for the faux animation

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

  // Native volume — reliable because the element is never captured by Web Audio.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = vol;
    try { localStorage.setItem("ekam.vol", String(vol)); } catch { /* fine */ }
  }, [vol]);

  const track = tracks[idx] ?? tracks[0];

  // Create the analysis-only AudioContext. MUST be called synchronously inside the play
  // click so the context can actually reach "running" — a context created/resumed outside a
  // user gesture stays "suspended", the analyser returns all-zeros, and the bars fall back to
  // the faux animation. This context never carries audio (gain 0), so it can't affect sound.
  const ensureVizCtx = useCallback((): AudioContext | null => {
    if (acRef.current) return acRef.current;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) acRef.current = new AC();
    } catch { acRef.current = null; }
    return acRef.current;
  }, []);

  // Wire captureStream → analyser onto the (already-running) context. captureStream does NOT
  // redirect the element's output, so audio stays native; failure just leaves the faux viz.
  const attachAnalyser = useCallback(() => {
    if (wiredRef.current) return;
    const a = audioRef.current as (HTMLAudioElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream }) | null;
    const ctx = acRef.current;
    if (!a || !ctx) return;
    const cap = a.captureStream?.bind(a) || a.mozCaptureStream?.bind(a);
    if (!cap) { wiredRef.current = true; return; } // no capture support (Safari/iOS) → faux viz
    try {
      const stream = cap();
      if (!stream.getAudioTracks || stream.getAudioTracks().length === 0) return; // not ready — retry
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = BARS * 2; an.smoothingTimeConstant = 0.8;
      const g = ctx.createGain(); g.gain.value = 0; // keep the analyser pulled WITHOUT making sound
      src.connect(an); an.connect(g); g.connect(ctx.destination);
      analyserRef.current = an; wiredRef.current = true;
    } catch { wiredRef.current = true; /* faux viz; audio unaffected */ }
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
        // faux: layered sines, center-weighted like a spectrum, scaled by eased energy
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

  // Returning to the tab: native audio needs nothing (it kept playing / the element's own
  // events keep the UI honest). Best-effort resume the analysis context so the bars wake up.
  useEffect(() => {
    const onVis = () => { if (!document.hidden) acRef.current?.resume?.().catch(() => {}); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    window.addEventListener("pageshow", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); window.removeEventListener("pageshow", onVis); };
  }, []);

  const startPlayback = useCallback(async () => {
    const a = audioRef.current; if (!a) return;
    // create + resume the viz context HERE, synchronously, while we still hold the user
    // gesture — otherwise it stays suspended and the real spectrum never flows (→ faux bars).
    const ctx = ensureVizCtx();
    ctx?.resume?.().catch(() => {});
    setLoading(true);
    try {
      await a.play();
      setPlaying(true); setLoading(false);
      ctx?.resume?.().catch(() => {});
      attachAnalyser(); // wire captureStream → analyser onto the now-running context
      // the captured audio track can lag the play() resolve by a tick — retry briefly
      if (!wiredRef.current) {
        let n = 0;
        const id = window.setInterval(() => { attachAnalyser(); if (wiredRef.current || ++n >= 6) window.clearInterval(id); }, 250);
      }
    } catch { setPlaying(false); setLoading(false); }
  }, [ensureVizCtx, attachAnalyser]);

  const play = useCallback(async (i: number) => {
    const a = audioRef.current; if (!a) return;
    setIdx(i); setCur(0);
    a.src = tracks[i].src;
    await startPlayback();
  }, [tracks, startPlayback]);

  const toggle = useCallback(async () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    if (!a.src) a.src = track.src;
    await startPlayback();
  }, [playing, track, startPlayback]);

  const next = useCallback(() => play((idx + 1) % tracks.length), [play, idx, tracks.length]);
  const prev = useCallback(() => play((idx - 1 + tracks.length) % tracks.length), [play, idx, tracks.length]);
  const seek = (t: number) => { const a = audioRef.current; if (a && isFinite(t)) { a.currentTime = t; setCur(t); } };

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
