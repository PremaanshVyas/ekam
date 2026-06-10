"use client";

import { useEffect, useRef, useState } from "react";
import { EDITOR_PALETTE } from "@/lib/demoWall";

const DRAW_RES = 512;   // paint buffer resolution (higher = crisper tiles everywhere)
const EDIT_CSS = 276;   // display size
const PAPER = "#f4eee2";
const BRUSH: Record<string, number> = { S: 14, M: 32, L: 60 }; // same relative feel at 512
const DOT: Record<string, number> = { S: 7, M: 12, L: 18 };    // size-button indicator dots
type Tool = "brush" | "eraser" | "fill" | "eyedropper";

export default function Studio({
  tileLabel, initialArtUrl, initialNote = "", accent = "#e8643c", onClose, onSubmit,
}: {
  tileLabel: string; initialArtUrl: string | null; initialNote?: string; accent?: string;
  onClose: () => void; onSubmit: (dataUrl: string, note: string) => Promise<void>;
}) {
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
  const paintingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const liveRef = useRef({ tool, color, size, mirror });
  liveRef.current = { tool, color, size, mirror };

  if (!bufRef.current) {
    const b = document.createElement("canvas"); b.width = DRAW_RES; b.height = DRAW_RES;
    const bg = b.getContext("2d")!; bg.fillStyle = PAPER; bg.fillRect(0, 0, DRAW_RES, DRAW_RES);
    bufRef.current = b;
  }

  const renderDisplay = () => {
    const cv = dispRef.current; if (!cv) return; const dpr = window.devicePixelRatio || 1;
    if (cv.width !== EDIT_CSS * dpr) { cv.width = EDIT_CSS * dpr; cv.height = EDIT_CSS * dpr; }
    const g = cv.getContext("2d")!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(bufRef.current!, 0, 0, EDIT_CSS, EDIT_CSS);
  };

  // load existing art when editing
  useEffect(() => {
    if (!initialArtUrl) { renderDisplay(); return; }
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => { const bg = bufRef.current!.getContext("2d")!; bg.drawImage(img, 0, 0, DRAW_RES, DRAW_RES); dirtyRef.current = true; renderDisplay(); force((n) => n + 1); };
    img.onerror = () => renderDisplay();
    img.src = initialArtUrl;
  }, [initialArtUrl]);

  const snapshot = () => { const g = bufRef.current!.getContext("2d")!; undoRef.current.push(g.getImageData(0, 0, DRAW_RES, DRAW_RES)); if (undoRef.current.length > 30) undoRef.current.shift(); };
  const toBuf = (e: PointerEvent) => { const r = dispRef.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * DRAW_RES, y: (e.clientY - r.top) / r.height * DRAW_RES }; };

  const dab = (x0: number, y0: number, x1: number, y1: number) => {
    const { tool, color, size, mirror } = liveRef.current; const g = bufRef.current!.getContext("2d")!;
    g.imageSmoothingEnabled = true; g.lineCap = "round"; g.lineJoin = "round";
    const w = BRUSH[size], col = tool === "eraser" ? PAPER : color;
    const seg = (ax: number, ay: number, bx: number, by: number) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(bx, by, w / 2, 0, 7); g.fill(); };
    seg(x0, y0, x1, y1); if (mirror) seg(DRAW_RES - x0, y0, DRAW_RES - x1, y1); dirtyRef.current = true;
  };
  const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  const pick = (p: { x: number; y: number }) => { const g = bufRef.current!.getContext("2d")!; const d = g.getImageData(Math.max(0, Math.min(DRAW_RES - 1, p.x | 0)), Math.max(0, Math.min(DRAW_RES - 1, p.y | 0)), 1, 1).data; setColor(hex(d[0], d[1], d[2])); setTool("brush"); };
  const fill = (p: { x: number; y: number }) => {
    const g = bufRef.current!.getContext("2d")!; const img = g.getImageData(0, 0, DRAW_RES, DRAW_RES), data = img.data;
    const W = DRAW_RES, sx = p.x | 0, sy = p.y | 0, si = (sy * W + sx) * 4; const tr = data[si], tg = data[si + 1], tb = data[si + 2];
    const c = color.replace("#", ""); const nr = parseInt(c.slice(0, 2), 16), ng = parseInt(c.slice(2, 4), 16), nb = parseInt(c.slice(4, 6), 16);
    if (Math.abs(tr - nr) + Math.abs(tg - ng) + Math.abs(tb - nb) < 12) return;
    const tol = 48, stack = [sy * W + sx], seen = new Uint8Array(W * W);
    while (stack.length) {
      const i = stack.pop()!; if (seen[i]) continue; seen[i] = 1; const o = i * 4;
      if (Math.abs(data[o] - tr) + Math.abs(data[o + 1] - tg) + Math.abs(data[o + 2] - tb) > tol) continue;
      data[o] = nr; data[o + 1] = ng; data[o + 2] = nb; data[o + 3] = 255;
      const x = i % W, y = (i / W) | 0;
      if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (y > 0) stack.push(i - W); if (y < W - 1) stack.push(i + W);
    }
    g.putImageData(img, 0, 0); dirtyRef.current = true;
  };

  useEffect(() => {
    const cv = dispRef.current!;
    const down = (e: PointerEvent) => {
      const t = liveRef.current.tool, p = toBuf(e); snapshot();
      if (t === "eyedropper") { pick(p); renderDisplay(); return; }
      if (t === "fill") { fill(p); renderDisplay(); force((n) => n + 1); return; }
      paintingRef.current = true; lastRef.current = p; try { cv.setPointerCapture(e.pointerId); } catch {} dab(p.x, p.y, p.x, p.y); renderDisplay();
    };
    const move = (e: PointerEvent) => { if (!paintingRef.current) return; const p = toBuf(e), l = lastRef.current!; dab(l.x, l.y, p.x, p.y); lastRef.current = p; renderDisplay(); };
    const up = () => { if (paintingRef.current) { paintingRef.current = false; force((n) => n + 1); } };
    cv.addEventListener("pointerdown", down); cv.addEventListener("pointermove", move); cv.addEventListener("pointerup", up); cv.addEventListener("pointerleave", up);
    return () => { cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointermove", move); cv.removeEventListener("pointerup", up); cv.removeEventListener("pointerleave", up); };
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
    <div className="panel panel--studio">
      <div className="panel__head">
        <span className="panel__eyebrow"><span className="studio__dot" style={{ background: accent }} />Studio · {tileLabel}</span>
        <button className="panel__x" onClick={onClose}>✕</button>
      </div>
      <div className="studio__stage">
        <canvas ref={dispRef} className="studio__canvas" style={{ width: EDIT_CSS, height: EDIT_CSS }} />
        <div className="studio__hint">a blank tile — paint what home looks like{mirror ? " · mirrored" : ""}</div>
      </div>
      <div className="studio__tools">
        {TOOLS.map(([k, label, gl]) => (
          <button key={k} className={"tool" + (tool === k ? " tool--on" : "")} title={label} onClick={() => setTool(k)}><span className="tool__gl">{gl}</span><span className="tool__l">{label}</span></button>
        ))}
        <button className={"tool" + (mirror ? " tool--on" : "")} title="Mirror" onClick={() => setMirror((s) => !s)}><span className="tool__gl">◫</span><span className="tool__l">Mirror</span></button>
        <button className="tool" title="Undo" onClick={undo}><span className="tool__gl">↺</span><span className="tool__l">Undo</span></button>
        <button className="tool" title="Clear" onClick={clearAll}><span className="tool__gl">⌧</span><span className="tool__l">Clear</span></button>
      </div>
      <div className="studio__row">
        <div className="studio__sizes">
          {["S", "M", "L"].map((s) => (
            <button key={s} className={"sizebtn" + (size === s ? " sizebtn--on" : "")} onClick={() => setSize(s)} title={"Brush " + s}>
              <span className="sizedot" style={{ width: DOT[s], height: DOT[s] }} />
            </button>
          ))}
        </div>
        <div className="studio__current" style={{ background: color }} title="Current colour" />
      </div>
      <div className="studio__palette">
        {EDITOR_PALETTE.map((c) => (
          <button key={c} className={"sw" + (color === c ? " sw--on" : "")} style={{ background: c }} onClick={() => { setColor(c); if (tool === "eraser" || tool === "eyedropper") setTool("brush"); }} />
        ))}
        <label className="sw sw--custom" style={{ background: color }} title="Custom colour">
          <input type="color" value={color} onChange={(e) => { setColor(e.target.value); if (tool === "eraser" || tool === "eyedropper") setTool("brush"); }} />
          <span className="sw__plus">+</span>
        </label>
      </div>
      <div className="studio__note">
        <input className="studio__noteinput" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Say a line — where were you when home looked like this?" />
        <span className="studio__count">{note.length}/140</span>
      </div>
      <button className="btn btn--primary btn--block" disabled={!dirtyRef.current || submitting} onClick={submit}>
        {submitting ? "submitting…" : dirtyRef.current ? "Submit your tile" : "Paint something first"}
      </button>
      <p className="claim__fine">Your tile goes for a quick review, then joins Canvas Nº 001 with your name beside it.</p>
    </div>
  );
}
