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

export default function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const vizRef = useRef<HTMLCanvasElement | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const srcNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);

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
  // self-healing pipeline: after long idle Chrome can kill the AudioContext's renderer
  // while reporting it healthy — and a captured <audio> element can never be re-captured,
  // so the ONLY cure is a fresh element + fresh context. audioKey swaps the element.
  const [audioKey, setAudioKey] = useState(0);
  const restoreRef = useRef<{ src: string; time: number; play: boolean } | null>(null);
  const pendingSeekRef = useRef(0);
  const lastRebuildRef = useRef(0);
  const volRef = useRef(vol); volRef.current = vol;
  // after the tab has been hidden (or the audio device changed), the context can be wired
  // to a stale output and stay "healthy" by every probe — so the next play rebuilds, period
  const staleRef = useRef(false);

  useEffect(() => {
    fetch("/audio/playlist.json").then((r) => r.json())
      .then((d) => { if (Array.isArray(d) && d.length && d.every((t) => t?.src)) setTracks(d); })
      .catch(() => { /* keep DEFAULT */ });
    // ignore near-zero saved volumes: the slider was a no-op for a while, so a stored 0
    // is almost certainly stale, and restoring it would mute the player invisibly
    try { const v = parseFloat(localStorage.getItem("ekam.vol") || ""); if (isFinite(v) && v >= 0.05 && v <= 1) setVol(v); } catch { /* default */ }
    if (window.innerWidth >= 900) setOpen(true);
  }, []);

  // Volume drives BOTH the element and a GainNode in the WebAudio graph. Once a
  // MediaElementSource exists, some browsers (Safari/iOS) ignore element.volume —
  // the gain node is the one that actually works everywhere.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = vol;
    if (gainRef.current && acRef.current) gainRef.current.gain.setTargetAtTime(vol, acRef.current.currentTime, 0.02);
    try { localStorage.setItem("ekam.vol", String(vol)); } catch { /* fine */ }
  }, [vol]);

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
      const gain = ac.createGain();
      gain.gain.value = vol;
      an.fftSize = BARS * 2;
      an.smoothingTimeConstant = 0.8;
      src.connect(an); an.connect(gain); gain.connect(ac.destination);
      acRef.current = ac; analyserRef.current = an; srcNodeRef.current = src; gainRef.current = gain;
    } catch { /* visualizer optional — audio still plays */ }
  }, [vol]);

  // Tear down the dead pipeline and stand up a new one (element + context + graph),
  // restoring the current track, position and play state. Throttled so a machine with
  // genuinely broken audio can't rebuild-loop.
  const rebuildPipeline = useCallback((wasPlaying: boolean) => {
    const now = Date.now();
    if (now - lastRebuildRef.current < 15000) return;
    lastRebuildRef.current = now;
    const a = audioRef.current;
    restoreRef.current = { src: a?.src || "", time: a?.currentTime || 0, play: wasPlaying };
    try { a?.pause(); } catch { /* already dead */ }
    try { acRef.current?.close(); } catch { /* already closed */ }
    acRef.current = null; analyserRef.current = null; gainRef.current = null; srcNodeRef.current = null;
    setAudioKey((k) => k + 1);
  }, []);

  // Health probe: a dead-but-"running" context has a frozen clock. Resume if suspended,
  // then verify currentTime actually advances.
  const graphAlive = useCallback(async () => {
    const ac = acRef.current; if (!ac) return true; // no graph yet — the element is still native
    try { if (ac.state !== "running") await ac.resume(); } catch { /* probe below decides */ }
    if ((ac.state as string) !== "running") return false;
    const t0 = ac.currentTime;
    await new Promise((r) => setTimeout(r, 200));
    return ac.currentTime > t0;
  }, []);

  // After a rebuild, the fresh element restores src/volume/position and resumes.
  useEffect(() => {
    if (audioKey === 0) return;
    const a = audioRef.current; const r = restoreRef.current; restoreRef.current = null;
    if (!a || !r) return;
    a.volume = volRef.current;
    pendingSeekRef.current = r.time;
    if (r.src) a.src = r.src; else return;
    ensureGraph(); acRef.current?.resume().catch(() => {});
    if (r.play) {
      setLoading(true);
      a.play().then(() => { setPlaying(true); setLoading(false); }).catch(() => { setPlaying(false); setLoading(false); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioKey]);

  // Watchdog while playing: if the context clock freezes mid-playback (came back to a
  // killed tab), rebuild without waiting for a click.
  useEffect(() => {
    if (!playing) return;
    let last = -1, misses = 0;
    const id = window.setInterval(() => {
      const ac = acRef.current; if (!ac) return;
      if (ac.state === "running") {
        if (ac.currentTime === last) { misses += 1; if (misses >= 2) rebuildPipeline(true); }
        else { misses = 0; last = ac.currentTime; }
      } else { ac.resume().catch(() => {}); }
    }, 2000);
    return () => window.clearInterval(id);
  }, [playing, rebuildPipeline]);

  // "Shows playing but silent" fix: the AudioContext gets suspended when the tab is
  // backgrounded or by autoplay policy. Resume it whenever we come back — and remember
  // that we were hidden, so the next play press rebuilds onto the current audio device.
  useEffect(() => {
    const resume = () => {
      if (document.hidden) { if (acRef.current) staleRef.current = true; return; }
      const ac = acRef.current;
      if (ac && ac.state === "suspended" && playingRef.current) ac.resume().catch(() => {});
    };
    const deviceChanged = () => {
      if (!acRef.current) return;
      if (playingRef.current) { lastRebuildRef.current = 0; rebuildPipeline(true); }
      else staleRef.current = true;
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    navigator.mediaDevices?.addEventListener?.("devicechange", deviceChanged);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      navigator.mediaDevices?.removeEventListener?.("devicechange", deviceChanged);
    };
  }, [rebuildPipeline]);

  const drawIdle = useCallback(() => {
    const cv = vizRef.current; const ctx = cv?.getContext("2d"); if (!cv || !ctx) return;
    ctx.clearRect(0, 0, VIZ_W, VIZ_H);
    const bw = VIZ_W / BARS;
    ctx.fillStyle = "rgba(239,233,225,0.13)";
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

  // start playback through a guaranteed-fresh-or-verified pipeline
  const startThroughFreshPipeline = (src: string, time: number) => {
    restoreRef.current = null; lastRebuildRef.current = 0; staleRef.current = false;
    rebuildPipeline(true);
    restoreRef.current = { src, time, play: true };
  };
  const play = async (i: number) => {
    const a = audioRef.current; if (!a) return;
    setIdx(i); setCur(0); setLoading(true);
    // hidden-since-last-play or device change → don't trust any probe, rebuild onto the current device
    if (acRef.current && (staleRef.current || !(await graphAlive()))) { startThroughFreshPipeline(tracks[i].src, 0); return; }
    ensureGraph(); acRef.current?.resume().catch(() => {});
    a.src = tracks[i].src;
    a.play().then(() => { setPlaying(true); setLoading(false); }).catch(() => { setPlaying(false); setLoading(false); });
  };
  const toggle = async () => {
    const a = audioRef.current; if (!a) return;
    if (playing) { a.pause(); setPlaying(false); return; }
    setLoading(true);
    if (acRef.current && (staleRef.current || !(await graphAlive()))) { startThroughFreshPipeline(a.src || track.src, a.currentTime || 0); return; }
    ensureGraph(); acRef.current?.resume().catch(() => {});
    if (!a.src) a.src = track.src;
    a.play().then(() => { setPlaying(true); setLoading(false); }).catch(() => { setLoading(false); });
  };
  const next = () => play((idx + 1) % tracks.length);
  const prev = () => play((idx - 1 + tracks.length) % tracks.length);
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
        key={audioKey}
        ref={audioRef} preload="none"
        onPlaying={() => { setPlaying(true); setLoading(false); }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onError={() => { setLoading(false); setPlaying(false); }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          setDur(e.currentTarget.duration);
          if (pendingSeekRef.current > 0) { try { e.currentTarget.currentTime = pendingSeekRef.current; } catch { /* not seekable yet */ } pendingSeekRef.current = 0; }
        }}
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
