"use client";

import { useEffect, useRef, useState } from "react";
import { EDITOR_PALETTE } from "@/lib/demoWall";

const DRAW_RES = 1024;   // high-res paint buffer (crisp + smooth)
const PAPER = "#f4eee2";
const BRUSH: Record<string, number> = { S: 28, M: 64, L: 120 }; // stroke width in buffer px (~2.7/6.3/11.7% of tile)
const DOT: Record<string, number> = { S: 7, M: 12, L: 18 };
type Tool = "brush" | "eraser" | "fill" | "eyedropper";
type Pt = { x: number; y: number; p: number };

export default function Studio({
  tileLabel, initialArtUrl, initialNote = "", accent = "#e8643c", onClose, onSubmit,
}: {
  tileLabel: string; initialArtUrl: string | null; initialNote?: string; accent?: string;
  onClose: () => void; onSubmit: (dataUrl: string, note: string) => Promise<void>;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dispRef = useRef<HTMLCanvasElement | null>(null);
  const bufRef = useRef<HTMLCanvasElement | null>(null);
  const [, force] = useState(0);
  const [color, setColor] = useState(accent);
  const [tool, setTool] = useState<Tool>("brush");
  const [size, setSize] = useState("M");
  const [mirror, setMirror] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [submitting, setSubmitting] = useState(false);
  const dirtyRef = useRef(false);
  const undoRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const ptsRef = useRef<Pt[]>([]);
  const live = useRef({ tool, color, size, mirror });
  live.current = { tool, color, size, mirror };

  if (!bufRef.current) {
    const b = document.createElement("canvas"); b.width = DRAW_RES; b.height = DRAW_RES;
    const bg = b.getContext("2d")!; bg.fillStyle = PAPER; bg.fillRect(0, 0, DRAW_RES, DRAW_RES);
    bufRef.current = b;
  }

  const renderDisplay = () => {
    const cv = dispRef.current; if (!cv || !cv.width) return;
    const g = cv.getContext("2d")!; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(bufRef.current!, 0, 0, cv.width, cv.height);
  };

  // Fit the display canvas to a square inside the stage, at device pixel ratio.
  useEffect(() => {
    const fit = () => {
      const stage = stageRef.current, cv = dispRef.current; if (!stage || !cv) return;
      const dpr = window.devicePixelRatio || 1;
      const s = Math.max(160, Math.floor(Math.min(stage.clientWidth, stage.clientHeight)));
      cv.style.width = s + "px"; cv.style.height = s + "px";
      cv.width = Math.round(s * dpr); cv.height = Math.round(s * dpr);
      renderDisplay();
    };
    fit();
    const ro = new ResizeObserver(fit); if (stageRef.current) ro.observe(stageRef.current);
    window.addEventListener("resize", fit);
    return () => { ro.disconnect(); window.removeEventListener("resize", fit); };
  }, []);

  // Load existing art when editing.
  useEffect(() => {
    if (!initialArtUrl) return;
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => { const g = bufRef.current!.getContext("2d")!; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, DRAW_RES, DRAW_RES); dirtyRef.current = true; renderDisplay(); force((n) => n + 1); };
    img.src = initialArtUrl;
  }, [initialArtUrl]);

  const snapshot = () => { const g = bufRef.current!.getContext("2d")!; undoRef.current.push(g.getImageData(0, 0, DRAW_RES, DRAW_RES)); if (undoRef.current.length > 15) undoRef.current.shift(); };

  // ── pointer + drawing (all helpers read refs, so no stale closures) ──
  useEffect(() => {
    const cv = dispRef.current!;
    const buf = () => bufRef.current!.getContext("2d")!;
    const toBuf = (e: PointerEvent): Pt => {
      const r = cv.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * DRAW_RES, y: (e.clientY - r.top) / r.height * DRAW_RES, p: e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 1 };
    };
    const widthOf = (pt: Pt) => BRUSH[live.current.size] * (0.4 + 0.6 * pt.p); // pressure taper (mouse/touch → full)
    const paint = () => (live.current.tool === "eraser" ? PAPER : live.current.color);
    const prep = (g: CanvasRenderingContext2D, w: number) => { g.strokeStyle = paint(); g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = w; };
    const dot = (pt: Pt) => { const g = buf(); g.fillStyle = paint(); g.beginPath(); g.arc(pt.x, pt.y, widthOf(pt) / 2, 0, 7); g.fill(); if (live.current.mirror) { g.beginPath(); g.arc(DRAW_RES - pt.x, pt.y, widthOf(pt) / 2, 0, 7); g.fill(); } };
    const line = (a: Pt, b: Pt) => { const g = buf(); prep(g, widthOf(b)); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); if (live.current.mirror) { g.beginPath(); g.moveTo(DRAW_RES - a.x, a.y); g.lineTo(DRAW_RES - b.x, b.y); g.stroke(); } };
    const curve = (a: Pt, b: Pt, c: Pt) => { // quadratic through midpoints, control=b → smooth freehand
      const g = buf(); const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, m2 = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 };
      prep(g, widthOf(b)); g.beginPath(); g.moveTo(m1.x, m1.y); g.quadraticCurveTo(b.x, b.y, m2.x, m2.y); g.stroke();
      if (live.current.mirror) { g.beginPath(); g.moveTo(DRAW_RES - m1.x, m1.y); g.quadraticCurveTo(DRAW_RES - b.x, b.y, DRAW_RES - m2.x, m2.y); g.stroke(); }
    };
    const pick = (pt: Pt) => { const d = buf().getImageData(Math.max(0, Math.min(DRAW_RES - 1, pt.x | 0)), Math.max(0, Math.min(DRAW_RES - 1, pt.y | 0)), 1, 1).data; setColor("#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")); setTool("brush"); };
    const fill = (pt: Pt) => {
      const g = buf(); const img = g.getImageData(0, 0, DRAW_RES, DRAW_RES), data = img.data; const W = DRAW_RES;
      const sx = pt.x | 0, sy = pt.y | 0, si = (sy * W + sx) * 4; const tr = data[si], tg = data[si + 1], tb = data[si + 2];
      const c = live.current.color.replace("#", ""); const nr = parseInt(c.slice(0, 2), 16), ng = parseInt(c.slice(2, 4), 16), nb = parseInt(c.slice(4, 6), 16);
      if (Math.abs(tr - nr) + Math.abs(tg - ng) + Math.abs(tb - nb) < 12) return;
      const tol = 48, stack = [sy * W + sx], seen = new Uint8Array(W * W);
      while (stack.length) { const i = stack.pop()!; if (seen[i]) continue; seen[i] = 1; const o = i * 4; if (Math.abs(data[o] - tr) + Math.abs(data[o + 1] - tg) + Math.abs(data[o + 2] - tb) > tol) continue; data[o] = nr; data[o + 1] = ng; data[o + 2] = nb; data[o + 3] = 255; const x = i % W, y = (i / W) | 0; if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (y > 0) stack.push(i - W); if (y < W - 1) stack.push(i + W); }
      g.putImageData(img, 0, 0); dirtyRef.current = true;
    };

    const down = (e: PointerEvent) => {
      const t = live.current.tool, p = toBuf(e); snapshot();
      if (t === "eyedropper") { pick(p); renderDisplay(); return; }
      if (t === "fill") { fill(p); renderDisplay(); force((n) => n + 1); return; }
      drawingRef.current = true; ptsRef.current = [p]; try { cv.setPointerCapture(e.pointerId); } catch {}
      dot(p); renderDisplay(); dirtyRef.current = true;
    };
    const move = (e: PointerEvent) => {
      if (!drawingRef.current) return;
      const evs = (typeof e.getCoalescedEvents === "function" && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
      for (const ev of evs) {
        const p = toBuf(ev); ptsRef.current.push(p); const n = ptsRef.current.length;
        if (n >= 3) curve(ptsRef.current[n - 3], ptsRef.current[n - 2], ptsRef.current[n - 1]);
        else if (n === 2) line(ptsRef.current[0], ptsRef.current[1]);
      }
      renderDisplay();
    };
    const up = () => {
      if (!drawingRef.current) return;
      const n = ptsRef.current.length;
      if (n >= 2) { const a = ptsRef.current[n - 2], b = ptsRef.current[n - 1]; const g = buf(); const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; prep(g, widthOf(b)); g.beginPath(); g.moveTo(m1.x, m1.y); g.lineTo(b.x, b.y); g.stroke(); if (live.current.mirror) { g.beginPath(); g.moveTo(DRAW_RES - m1.x, m1.y); g.lineTo(DRAW_RES - b.x, b.y); g.stroke(); } }
      drawingRef.current = false; ptsRef.current = []; renderDisplay(); force((n2) => n2 + 1);
    };
    cv.addEventListener("pointerdown", down); cv.addEventListener("pointermove", move); cv.addEventListener("pointerup", up); cv.addEventListener("pointerleave", up); cv.addEventListener("pointercancel", up);
    return () => { cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointermove", move); cv.removeEventListener("pointerup", up); cv.removeEventListener("pointerleave", up); cv.removeEventListener("pointercancel", up); };
  }, []);

  const undo = () => { if (undoRef.current.length) { bufRef.current!.getContext("2d")!.putImageData(undoRef.current.pop()!, 0, 0); renderDisplay(); force((n) => n + 1); } };
  const clearAll = () => { snapshot(); const g = bufRef.current!.getContext("2d")!; g.fillStyle = PAPER; g.fillRect(0, 0, DRAW_RES, DRAW_RES); dirtyRef.current = false; renderDisplay(); force((n) => n + 1); };
  const submit = async () => {
    if (!dirtyRef.current || submitting) return;
    const out = document.createElement("canvas"); out.width = DRAW_RES; out.height = DRAW_RES; out.getContext("2d")!.drawImage(bufRef.current!, 0, 0);
    setSubmitting(true);
    try { await onSubmit(out.toDataURL("image/png"), note.trim()); } catch (err) { setSubmitting(false); alert("Couldn't submit — " + (err as Error).message); }
  };

  const TOOLS: [Tool, string, string][] = [["brush", "Brush", "🖌"], ["eraser", "Eraser", "⌫"], ["fill", "Fill", "◧"], ["eyedropper", "Pick", "⊙"]];

  return (
    <div className="studio-full">
      <div className="studio-full__bar">
        <button className="ex__home" onClick={onClose}>‹ <span className="studio-full__title">studio · {tileLabel}</span></button>
        <span className="studio-full__hint">paint what home looks like{mirror ? " · mirrored" : ""}</span>
        <button className="panel__x" onClick={onClose} aria-label="close studio">✕</button>
      </div>

      <div ref={stageRef} className="studio-full__stage">
        <canvas ref={dispRef} className="studio-full__canvas" />
      </div>

      <div className="studio-full__dock">
        <div className="studio-full__palette">
          {EDITOR_PALETTE.map((c) => (
            <button key={c} className={"sw" + (color === c ? " sw--on" : "")} style={{ background: c }} onClick={() => { setColor(c); if (tool === "eraser" || tool === "eyedropper") setTool("brush"); }} />
          ))}
          <label className="sw sw--custom" style={{ background: color }} title="Custom colour">
            <input type="color" value={color} onChange={(e) => { setColor(e.target.value); if (tool === "eraser" || tool === "eyedropper") setTool("brush"); }} />
            <span className="sw__plus">+</span>
          </label>
        </div>

        <div className="studio-full__row">
          {TOOLS.map(([k, label, gl]) => (
            <button key={k} className={"tool" + (tool === k ? " tool--on" : "")} title={label} onClick={() => setTool(k)}><span className="tool__gl">{gl}</span><span className="tool__l">{label}</span></button>
          ))}
          <button className={"tool" + (mirror ? " tool--on" : "")} title="Mirror" onClick={() => setMirror((s) => !s)}><span className="tool__gl">◫</span><span className="tool__l">Mirror</span></button>
          <button className="tool" title="Undo" onClick={undo}><span className="tool__gl">↺</span><span className="tool__l">Undo</span></button>
          <button className="tool" title="Clear" onClick={clearAll}><span className="tool__gl">⌧</span><span className="tool__l">Clear</span></button>
          <div className="studio__sizes">
            {["S", "M", "L"].map((s) => (
              <button key={s} className={"sizebtn" + (size === s ? " sizebtn--on" : "")} onClick={() => setSize(s)} title={"Brush " + s}><span className="sizedot" style={{ width: DOT[s], height: DOT[s] }} /></button>
            ))}
          </div>
          <div className="studio__current" style={{ background: color }} title="Current colour" />
        </div>

        <div className="studio-full__row">
          <div className="studio__note" style={{ flex: 1, maxWidth: 460, marginBottom: 0 }}>
            <input className="studio__noteinput" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Say a line — where were you when home looked like this?" />
            <span className="studio__count">{note.length}/140</span>
          </div>
          <button className="btn btn--primary" style={{ minWidth: 200 }} disabled={!dirtyRef.current || submitting} onClick={submit}>{submitting ? "submitting…" : dirtyRef.current ? "Submit your tile" : "Paint something first"}</button>
        </div>
        <p className="studio-full__hint">your tile goes for a quick review, then joins Canvas Nº 001 with your name.</p>
      </div>
    </div>
  );
}
