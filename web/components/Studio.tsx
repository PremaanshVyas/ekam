"use client";

import { useEffect, useRef, useState } from "react";
import { EDITOR_PALETTE } from "@/lib/demoWall";

const DRAW_RES = 1024;   // high-res paint buffer
const PAPER = "#f4eee2";

type BrushType = "pen" | "marker" | "highlighter" | "airbrush" | "pencil";
type Tool = "brush" | "eraser" | "fill" | "eyedropper" | "line" | "rect" | "ellipse" | "hand";
type Pt = { x: number; y: number; p: number };
const SHAPES = new Set<Tool>(["line", "rect", "ellipse"]);

// Each brush composites its whole stroke onto the canvas once, so translucent
// brushes don't blotch where the stroke overlaps itself.
const BRUSHES: Record<BrushType, { alpha: number; blend: GlobalCompositeOperation; soft: number; scale: number; gl: string; label: string }> = {
  pen: { alpha: 1, blend: "source-over", soft: 0, scale: 1, gl: "✎", label: "Pen" },
  marker: { alpha: 0.92, blend: "multiply", soft: 0, scale: 1.15, gl: "▰", label: "Marker" },
  highlighter: { alpha: 0.38, blend: "multiply", soft: 0, scale: 1.8, gl: "▮", label: "Highlight" },
  airbrush: { alpha: 0.5, blend: "source-over", soft: 0.7, scale: 1.15, gl: "✸", label: "Airbrush" },
  pencil: { alpha: 0.85, blend: "source-over", soft: 0, scale: 0.45, gl: "✏", label: "Pencil" },
};
const BRUSH_LIST = Object.keys(BRUSHES) as BrushType[];

export default function Studio({
  tileLabel, initialArtUrl, initialNote = "", accent = "#e8643c", onClose, onSubmit, onSaveDraft,
}: {
  tileLabel: string; initialArtUrl: string | null; initialNote?: string; accent?: string;
  onClose: () => void; onSubmit: (dataUrl: string, note: string) => Promise<void>;
  onSaveDraft?: (dataUrl: string, note: string) => Promise<{ ok: boolean; updatedAt?: string }>;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dispRef = useRef<HTMLCanvasElement | null>(null);
  const bufRef = useRef<HTMLCanvasElement | null>(null);
  const strokeRef = useRef<HTMLCanvasElement | null>(null);
  const colorInputRef = useRef<HTMLInputElement | null>(null);
  const [, force] = useState(0);
  const [color, setColor] = useState(accent);
  const [tool, setTool] = useState<Tool>("brush");
  const [brushType, setBrushType] = useState<BrushType>("pen");
  const [brushPx, setBrushPx] = useState(56);
  const [opacity, setOpacity] = useState(1);
  const [mirror, setMirror] = useState(false);
  const [note, setNote] = useState(initialNote);
  const [submitting, setSubmitting] = useState(false);
  const [loadingArt, setLoadingArt] = useState<boolean>(!!initialArtUrl);
  const [recent, setRecent] = useState<string[]>([]);
  const dirtyRef = useRef(false);
  const undoRef = useRef<ImageData[]>([]);
  const redoRef = useRef<ImageData[]>([]);
  const drawingRef = useRef(false);
  const ptsRef = useRef<Pt[]>([]);
  const shapeStartRef = useRef<Pt | null>(null);
  const viewRef = useRef({ zoom: 1, ox: 0, oy: 0 }); // ox/oy = top-left of visible region in buffer px
  const [zoom, setZoom] = useState(1);
  const panningRef = useRef<{ x: number; y: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; cx: number; cy: number; zoom: number; ox: number; oy: number } | null>(null);
  const applyZoomRef = useRef<(nz: number, fx?: number, fy?: number) => void>(() => {});
  const live = useRef({ tool, color, brushPx, opacity, mirror, brushType });
  live.current = { tool, color, brushPx, opacity, mirror, brushType };

  if (!bufRef.current) {
    const b = document.createElement("canvas"); b.width = DRAW_RES; b.height = DRAW_RES;
    const g = b.getContext("2d")!; g.fillStyle = PAPER; g.fillRect(0, 0, DRAW_RES, DRAW_RES);
    bufRef.current = b;
    const s = document.createElement("canvas"); s.width = DRAW_RES; s.height = DRAW_RES; strokeRef.current = s;
  }

  const renderDisplay = () => {
    const cv = dispRef.current; if (!cv || !cv.width) return;
    const g = cv.getContext("2d")!; g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    const v = viewRef.current; const srcW = DRAW_RES / v.zoom;
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(bufRef.current!, v.ox, v.oy, srcW, srcW, 0, 0, cv.width, cv.height);
    const pt = live.current.tool;
    if (drawingRef.current && (pt === "brush" || SHAPES.has(pt))) {
      const isShape = SHAPES.has(pt); const bp = BRUSHES[live.current.brushType];
      g.globalAlpha = isShape ? live.current.opacity : bp.alpha * live.current.opacity;
      g.globalCompositeOperation = isShape ? "source-over" : bp.blend;
      g.drawImage(strokeRef.current!, v.ox, v.oy, srcW, srcW, 0, 0, cv.width, cv.height);
      g.globalAlpha = 1; g.globalCompositeOperation = "source-over";
    }
  };

  // ── cross-device autosave drafts (debounced + periodic + on tab-hide) ──
  const [saving, setSaving] = useState(false);
  const [unsaved, setUnsaved] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [autosaveOff, setAutosaveOff] = useState(false);
  const unsavedRef = useRef(false);
  const savingRef = useRef(false);
  const offRef = useRef(false);
  const failsRef = useRef(0);
  const saveTimer = useRef<number | null>(null);
  const noteRef = useRef(note); noteRef.current = note;
  const saveNowRef = useRef<() => void>(() => {});
  const autosaveRef = useRef<() => void>(() => {});
  saveNowRef.current = () => {
    if (!onSaveDraft || savingRef.current || !unsavedRef.current || offRef.current) return;
    savingRef.current = true; setSaving(true);
    const out = document.createElement("canvas"); out.width = DRAW_RES; out.height = DRAW_RES; out.getContext("2d")!.drawImage(bufRef.current!, 0, 0);
    onSaveDraft(out.toDataURL("image/png"), noteRef.current.trim())
      .then((res) => { if (res && res.ok) { unsavedRef.current = false; setUnsaved(false); setSavedAt(Date.now()); failsRef.current = 0; } else if (++failsRef.current >= 2) { offRef.current = true; setAutosaveOff(true); } })
      .catch(() => { if (++failsRef.current >= 2) { offRef.current = true; setAutosaveOff(true); } })
      .finally(() => { savingRef.current = false; setSaving(false); });
  };
  autosaveRef.current = () => {
    if (!onSaveDraft || offRef.current) return;
    unsavedRef.current = true; setUnsaved(true);
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveNowRef.current(), 3000);
  };
  useEffect(() => {
    const iv = window.setInterval(() => { if (unsavedRef.current && !savingRef.current && !offRef.current) saveNowRef.current(); }, 20000);
    const vis = () => { if (document.hidden && unsavedRef.current) saveNowRef.current(); };
    document.addEventListener("visibilitychange", vis);
    return () => { window.clearInterval(iv); document.removeEventListener("visibilitychange", vis); if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, []);

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

  useEffect(() => {
    if (!initialArtUrl) { setLoadingArt(false); return; }
    setLoadingArt(true);
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => { const g = bufRef.current!.getContext("2d")!; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, DRAW_RES, DRAW_RES); dirtyRef.current = true; renderDisplay(); setLoadingArt(false); force((n) => n + 1); };
    img.onerror = () => setLoadingArt(false);
    img.src = initialArtUrl;
  }, [initialArtUrl]);

  // recent custom colours (persisted per device)
  useEffect(() => { try { const r = JSON.parse(localStorage.getItem("ekam.recentColors") || "[]"); if (Array.isArray(r)) setRecent(r.slice(0, 8)); } catch {} }, []);
  useEffect(() => {
    if (EDITOR_PALETTE.includes(color)) return;
    setRecent((prev) => { const next = [color, ...prev.filter((c) => c !== color)].slice(0, 8); try { localStorage.setItem("ekam.recentColors", JSON.stringify(next)); } catch {} return next; });
  }, [color]);

  const snapshot = () => { const g = bufRef.current!.getContext("2d")!; undoRef.current.push(g.getImageData(0, 0, DRAW_RES, DRAW_RES)); if (undoRef.current.length > 12) undoRef.current.shift(); redoRef.current = []; };

  useEffect(() => {
    const cv = dispRef.current!;
    const buf = () => bufRef.current!.getContext("2d")!;
    const sc = () => strokeRef.current!.getContext("2d")!;
    const isEraser = () => live.current.tool === "eraser";
    const target = () => (isEraser() ? buf() : sc());
    const paintCol = () => (isEraser() ? PAPER : live.current.color);
    const bp = () => BRUSHES[live.current.brushType];
    const widthOf = (pt: Pt) => live.current.brushPx * (isEraser() ? 1 : bp().scale) * (0.4 + 0.6 * pt.p);
    const prep = (g: CanvasRenderingContext2D, w: number) => { const c = paintCol(); g.strokeStyle = c; g.fillStyle = c; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = w; g.shadowBlur = isEraser() ? 0 : bp().soft * w; g.shadowColor = c; };
    const toBuf = (e: PointerEvent): Pt => { const r = cv.getBoundingClientRect(); const v = viewRef.current; const srcW = DRAW_RES / v.zoom; return { x: v.ox + (e.clientX - r.left) / r.width * srcW, y: v.oy + (e.clientY - r.top) / r.height * srcW, p: e.pointerType === "pen" && e.pressure > 0 ? e.pressure : 1 }; };
    const dot = (pt: Pt) => { const g = target(), w = widthOf(pt); prep(g, w); g.beginPath(); g.arc(pt.x, pt.y, w / 2, 0, 7); g.fill(); if (live.current.mirror) { g.beginPath(); g.arc(DRAW_RES - pt.x, pt.y, w / 2, 0, 7); g.fill(); } g.shadowBlur = 0; };
    const line = (a: Pt, b: Pt) => { const g = target(), w = widthOf(b); prep(g, w); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); if (live.current.mirror) { g.beginPath(); g.moveTo(DRAW_RES - a.x, a.y); g.lineTo(DRAW_RES - b.x, b.y); g.stroke(); } g.shadowBlur = 0; };
    const curve = (a: Pt, b: Pt, c: Pt) => { const g = target(), w = widthOf(b); const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, m2 = { x: (b.x + c.x) / 2, y: (b.y + c.y) / 2 }; prep(g, w); g.beginPath(); g.moveTo(m1.x, m1.y); g.quadraticCurveTo(b.x, b.y, m2.x, m2.y); g.stroke(); if (live.current.mirror) { g.beginPath(); g.moveTo(DRAW_RES - m1.x, m1.y); g.quadraticCurveTo(DRAW_RES - b.x, b.y, DRAW_RES - m2.x, m2.y); g.stroke(); } g.shadowBlur = 0; };
    const pick = (pt: Pt) => { const d = buf().getImageData(Math.max(0, Math.min(DRAW_RES - 1, pt.x | 0)), Math.max(0, Math.min(DRAW_RES - 1, pt.y | 0)), 1, 1).data; setColor("#" + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, "0")).join("")); setTool("brush"); };
    const fill = (pt: Pt) => {
      const g = buf(); const img = g.getImageData(0, 0, DRAW_RES, DRAW_RES), data = img.data; const W = DRAW_RES;
      const sx = pt.x | 0, sy = pt.y | 0, si = (sy * W + sx) * 4; const tr = data[si], tg = data[si + 1], tb = data[si + 2];
      const cc = live.current.color.replace("#", ""); const nr = parseInt(cc.slice(0, 2), 16), ng = parseInt(cc.slice(2, 4), 16), nb = parseInt(cc.slice(4, 6), 16);
      if (Math.abs(tr - nr) + Math.abs(tg - ng) + Math.abs(tb - nb) < 12) return;
      const tol = 48, stack = [sy * W + sx], seen = new Uint8Array(W * W);
      while (stack.length) { const i = stack.pop()!; if (seen[i]) continue; seen[i] = 1; const o = i * 4; if (Math.abs(data[o] - tr) + Math.abs(data[o + 1] - tg) + Math.abs(data[o + 2] - tb) > tol) continue; data[o] = nr; data[o + 1] = ng; data[o + 2] = nb; data[o + 3] = 255; const x = i % W, y = (i / W) | 0; if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (y > 0) stack.push(i - W); if (y < W - 1) stack.push(i + W); }
      g.putImageData(img, 0, 0); dirtyRef.current = true;
    };
    const commit = () => { if (isEraser()) return; const g = buf(); const p = BRUSHES[live.current.brushType]; g.save(); g.globalAlpha = p.alpha * live.current.opacity; g.globalCompositeOperation = p.blend; g.drawImage(strokeRef.current!, 0, 0); g.restore(); sc().clearRect(0, 0, DRAW_RES, DRAW_RES); };
    const drawShape = (a: Pt, b: Pt, kind: string) => {
      const g = sc(); g.clearRect(0, 0, DRAW_RES, DRAW_RES); g.strokeStyle = live.current.color; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = live.current.brushPx; g.shadowBlur = 0;
      const seg = (ax: number, bx: number) => {
        if (kind === "line") { g.beginPath(); g.moveTo(ax, a.y); g.lineTo(bx, b.y); g.stroke(); }
        else if (kind === "rect") { g.strokeRect(Math.min(ax, bx), Math.min(a.y, b.y), Math.abs(bx - ax), Math.abs(b.y - a.y)); }
        else { g.beginPath(); g.ellipse((ax + bx) / 2, (a.y + b.y) / 2, Math.abs(bx - ax) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2); g.stroke(); }
      };
      seg(a.x, b.x); if (live.current.mirror) seg(DRAW_RES - a.x, DRAW_RES - b.x);
    };
    const commitShape = () => { const g = buf(); g.save(); g.globalAlpha = live.current.opacity; g.globalCompositeOperation = "source-over"; g.drawImage(strokeRef.current!, 0, 0); g.restore(); sc().clearRect(0, 0, DRAW_RES, DRAW_RES); };

    const ptrs = pointersRef.current;
    const down = (e: PointerEvent) => {
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { // two fingers → pinch-zoom; cancel any in-progress stroke
        if (drawingRef.current) { drawingRef.current = false; ptsRef.current = []; shapeStartRef.current = null; sc().clearRect(0, 0, DRAW_RES, DRAW_RES); renderDisplay(); }
        panningRef.current = null;
        const [a, b] = [...ptrs.values()]; const v = viewRef.current;
        pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, zoom: v.zoom, ox: v.ox, oy: v.oy };
        return;
      }
      if (ptrs.size > 2) return;
      const t = live.current.tool, p = toBuf(e);
      if (t === "hand") { panningRef.current = { x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch {} return; }
      if (t === "eyedropper") { pick(p); return; }
      snapshot();
      if (t === "fill") { fill(p); renderDisplay(); force((n) => n + 1); autosaveRef.current(); return; }
      if (SHAPES.has(t)) { sc().clearRect(0, 0, DRAW_RES, DRAW_RES); shapeStartRef.current = p; drawingRef.current = true; ptsRef.current = [p]; try { cv.setPointerCapture(e.pointerId); } catch {} dirtyRef.current = true; return; }
      if (!isEraser()) sc().clearRect(0, 0, DRAW_RES, DRAW_RES);
      drawingRef.current = true; ptsRef.current = [p]; try { cv.setPointerCapture(e.pointerId); } catch {}
      dot(p); renderDisplay(); dirtyRef.current = true;
    };
    const move = (e: PointerEvent) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinchRef.current && ptrs.size >= 2) { // pinch: keep the start centroid's buffer point under the moving centroid
        const [a, b] = [...ptrs.values()]; const pr = pinchRef.current; const r = cv.getBoundingClientRect();
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1; const nz = Math.max(1, Math.min(6, pr.zoom * (dist / pr.dist)));
        const startSrcW = DRAW_RES / pr.zoom; const bx = pr.ox + ((pr.cx - r.left) / r.width) * startSrcW, by = pr.oy + ((pr.cy - r.top) / r.height) * startSrcW;
        const nsrc = DRAW_RES / nz; const ncx = (a.x + b.x) / 2, ncy = (a.y + b.y) / 2; const v = viewRef.current; v.zoom = nz;
        v.ox = Math.max(0, Math.min(DRAW_RES - nsrc, bx - ((ncx - r.left) / r.width) * nsrc));
        v.oy = Math.max(0, Math.min(DRAW_RES - nsrc, by - ((ncy - r.top) / r.height) * nsrc));
        setZoom(nz); renderDisplay(); return;
      }
      if (panningRef.current) { const r = cv.getBoundingClientRect(); const v = viewRef.current; const srcW = DRAW_RES / v.zoom; v.ox = Math.max(0, Math.min(DRAW_RES - srcW, v.ox - (e.clientX - panningRef.current.x) / r.width * srcW)); v.oy = Math.max(0, Math.min(DRAW_RES - srcW, v.oy - (e.clientY - panningRef.current.y) / r.height * srcW)); panningRef.current = { x: e.clientX, y: e.clientY }; renderDisplay(); return; }
      if (!drawingRef.current) return;
      if (SHAPES.has(live.current.tool)) { const a = shapeStartRef.current; if (a) { drawShape(a, toBuf(e), live.current.tool); renderDisplay(); } return; }
      const evs = (typeof e.getCoalescedEvents === "function" && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
      for (const ev of evs) { const p = toBuf(ev); ptsRef.current.push(p); const n = ptsRef.current.length; if (n >= 3) curve(ptsRef.current[n - 3], ptsRef.current[n - 2], ptsRef.current[n - 1]); else if (n === 2) line(ptsRef.current[0], ptsRef.current[1]); }
      renderDisplay();
    };
    const up = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinchRef.current = null;
      if (panningRef.current) { panningRef.current = null; return; }
      if (!drawingRef.current) return;
      if (SHAPES.has(live.current.tool)) { commitShape(); shapeStartRef.current = null; drawingRef.current = false; ptsRef.current = []; renderDisplay(); force((nn) => nn + 1); autosaveRef.current(); return; }
      const n = ptsRef.current.length;
      if (n >= 2) { const a = ptsRef.current[n - 2], b = ptsRef.current[n - 1], g = target(), w = widthOf(b); const m1 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; prep(g, w); g.beginPath(); g.moveTo(m1.x, m1.y); g.lineTo(b.x, b.y); g.stroke(); if (live.current.mirror) { g.beginPath(); g.moveTo(DRAW_RES - m1.x, m1.y); g.lineTo(DRAW_RES - b.x, b.y); g.stroke(); } g.shadowBlur = 0; }
      commit();
      drawingRef.current = false; ptsRef.current = []; renderDisplay(); force((nn) => nn + 1); autosaveRef.current();
    };
    const wheel = (e: WheelEvent) => { e.preventDefault(); const r = cv.getBoundingClientRect(); applyZoomRef.current(viewRef.current.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height); };
    cv.addEventListener("pointerdown", down); cv.addEventListener("pointermove", move); cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up); cv.addEventListener("wheel", wheel, { passive: false });
    return () => { cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointermove", move); cv.removeEventListener("pointerup", up); cv.removeEventListener("pointercancel", up); cv.removeEventListener("wheel", wheel); };
  }, []);

  const applyZoom = (nz: number, fx = 0.5, fy = 0.5) => {
    const v = viewRef.current; const srcW = DRAW_RES / v.zoom;
    const bx = v.ox + fx * srcW, by = v.oy + fy * srcW;
    const z = Math.max(1, Math.min(6, nz)); const nsrc = DRAW_RES / z;
    v.zoom = z; v.ox = Math.max(0, Math.min(DRAW_RES - nsrc, bx - fx * nsrc)); v.oy = Math.max(0, Math.min(DRAW_RES - nsrc, by - fy * nsrc));
    setZoom(z); renderDisplay();
  };
  applyZoomRef.current = applyZoom;

  const snapBuf = () => bufRef.current!.getContext("2d")!.getImageData(0, 0, DRAW_RES, DRAW_RES);
  const undo = () => { if (!undoRef.current.length) return; redoRef.current.push(snapBuf()); bufRef.current!.getContext("2d")!.putImageData(undoRef.current.pop()!, 0, 0); renderDisplay(); force((n) => n + 1); autosaveRef.current(); };
  const redo = () => { if (!redoRef.current.length) return; undoRef.current.push(snapBuf()); bufRef.current!.getContext("2d")!.putImageData(redoRef.current.pop()!, 0, 0); renderDisplay(); force((n) => n + 1); autosaveRef.current(); };
  const clearAll = () => { snapshot(); const g = bufRef.current!.getContext("2d")!; g.fillStyle = PAPER; g.fillRect(0, 0, DRAW_RES, DRAW_RES); dirtyRef.current = false; renderDisplay(); force((n) => n + 1); autosaveRef.current(); };
  const submit = async () => {
    if (!dirtyRef.current || submitting) return;
    const out = document.createElement("canvas"); out.width = DRAW_RES; out.height = DRAW_RES; out.getContext("2d")!.drawImage(bufRef.current!, 0, 0);
    setSubmitting(true);
    try { await onSubmit(out.toDataURL("image/png"), note.trim()); } catch (err) { setSubmitting(false); alert("Couldn't submit — " + (err as Error).message); }
  };

  const pickColor = (c: string) => { setColor(c); if (tool === "eraser" || tool === "eyedropper") setTool("brush"); };
  const customActive = !EDITOR_PALETTE.includes(color);

  return (
    <div className="studio-full">
      <div className="studio-full__bar">
        <button className="ex__home" onClick={onClose}>‹ <span className="studio-full__title">studio · {tileLabel}</span></button>
        <span className="studio-full__hint">{onSaveDraft ? (autosaveOff ? "autosave off" : saving ? "saving…" : unsaved ? "unsaved…" : savedAt ? "draft saved ✓ · resumes on any device" : "autosaves as you paint") : ("paint what home looks like" + (mirror ? " · mirrored" : ""))}</span>
        <button className="panel__x" onClick={onClose} aria-label="close studio">✕</button>
      </div>

      <div className="studio-full__body">
      <div ref={stageRef} className="studio-full__stage">
        <canvas ref={dispRef} className="studio-full__canvas" />
        {loadingArt && <div className="studio-full__loading"><span className="studio-full__spin" /><span>loading your painting…</span></div>}
      </div>

      <div className="studio-full__dock">
        {recent.length > 0 && (
          <div className="studio-full__recent">
            <span className="studio-full__rlabel">recent</span>
            {recent.map((c) => (
              <button key={c} className={"sw" + (color === c ? " sw--on" : "")} style={{ background: c }} onClick={() => pickColor(c)} />
            ))}
          </div>
        )}
        <div className="studio-full__palette">
          {EDITOR_PALETTE.map((c) => (
            <button key={c} className={"sw" + (color === c ? " sw--on" : "")} style={{ background: c }} onClick={() => pickColor(c)} />
          ))}
          <button type="button" className={"sw sw--custom" + (customActive ? " sw--on" : "")} title="custom colour"
            style={{ background: customActive ? color : "conic-gradient(from 90deg,#f44,#fa3,#fd3,#6c3,#3bb,#36f,#a4f,#f49,#f44)" }}
            onClick={() => colorInputRef.current?.click()}>
            <span className="sw__plus">+</span>
          </button>
        </div>

        <div className="studio-full__row">
          {BRUSH_LIST.map((k) => (
            <button key={k} className={"tool" + (tool === "brush" && brushType === k ? " tool--on" : "")} title={BRUSHES[k].label} onClick={() => { setTool("brush"); setBrushType(k); }}><span className="tool__gl">{BRUSHES[k].gl}</span><span className="tool__l">{BRUSHES[k].label}</span></button>
          ))}
          <button className={"tool" + (tool === "eraser" ? " tool--on" : "")} title="Eraser" onClick={() => setTool("eraser")}><span className="tool__gl">⌫</span><span className="tool__l">Eraser</span></button>
        </div>

        <div className="studio-full__row">
          <button className={"tool" + (tool === "fill" ? " tool--on" : "")} title="Fill" onClick={() => setTool("fill")}><span className="tool__gl">◧</span><span className="tool__l">Fill</span></button>
          <button className={"tool" + (tool === "eyedropper" ? " tool--on" : "")} title="Pick" onClick={() => setTool("eyedropper")}><span className="tool__gl">⊙</span><span className="tool__l">Pick</span></button>
          <button className={"tool" + (tool === "line" ? " tool--on" : "")} title="Line" onClick={() => setTool("line")}><span className="tool__gl">╱</span><span className="tool__l">Line</span></button>
          <button className={"tool" + (tool === "rect" ? " tool--on" : "")} title="Rectangle" onClick={() => setTool("rect")}><span className="tool__gl">▭</span><span className="tool__l">Rect</span></button>
          <button className={"tool" + (tool === "ellipse" ? " tool--on" : "")} title="Ellipse" onClick={() => setTool("ellipse")}><span className="tool__gl">◯</span><span className="tool__l">Oval</span></button>
          <button className={"tool" + (tool === "hand" ? " tool--on" : "")} title="Pan — drag to move when zoomed in" onClick={() => setTool("hand")}><span className="tool__gl">✋</span><span className="tool__l">Pan</span></button>
          <button className={"tool" + (mirror ? " tool--on" : "")} title="Mirror" onClick={() => setMirror((s) => !s)}><span className="tool__gl">◫</span><span className="tool__l">Mirror</span></button>
          <button className="tool" title="Undo" onClick={undo}><span className="tool__gl">↺</span><span className="tool__l">Undo</span></button>
          <button className="tool" title="Redo" onClick={redo}><span className="tool__gl">↻</span><span className="tool__l">Redo</span></button>
          <button className="tool" title="Clear" onClick={clearAll}><span className="tool__gl">⌧</span><span className="tool__l">Clear</span></button>
        </div>

        <div className="studio-full__row">
          <label className="studio__ctl"><span className="studio__ctll">size</span>
            <input type="range" className="studio__range" min={4} max={180} value={brushPx} onChange={(e) => setBrushPx(+e.target.value)} />
            <span className="sizedot" style={{ width: Math.max(4, Math.round(brushPx / 180 * 22)), height: Math.max(4, Math.round(brushPx / 180 * 22)) }} />
          </label>
          <label className="studio__ctl"><span className="studio__ctll">opacity</span>
            <input type="range" className="studio__range" min={10} max={100} value={Math.round(opacity * 100)} onChange={(e) => setOpacity(+e.target.value / 100)} />
            <span className="studio__ctlv">{Math.round(opacity * 100)}%</span>
          </label>
          <label className="studio__ctl"><span className="studio__ctll">zoom</span>
            <input type="range" className="studio__range" min={1} max={6} step={0.1} value={zoom} onChange={(e) => applyZoom(+e.target.value)} />
            <button className="studio__reset" onClick={() => applyZoom(1)} title="Fit to screen">{zoom > 1.05 ? zoom.toFixed(1) + "×" : "fit"}</button>
          </label>
          <div className="studio__current" style={{ background: color }} title="Current colour" />
        </div>

        <div className="studio-full__row">
          <div className="studio__note" style={{ flex: 1, maxWidth: 460, marginBottom: 0 }}>
            <input className="studio__noteinput" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Say a line — where were you when home looked like this?" />
            <span className="studio__count">{note.length}/140</span>
          </div>
          <button className="btn btn--primary" style={{ minWidth: 200 }} disabled={!dirtyRef.current || submitting} onClick={submit}>{submitting ? "submitting…" : dirtyRef.current ? "Submit your tile" : "Paint something first"}</button>
        </div>
      </div>
      </div>

      <input ref={colorInputRef} type="color" value={color} onChange={(e) => { setColor(e.target.value); if (tool === "eraser" || tool === "eyedropper") setTool("brush"); }} aria-hidden tabIndex={-1} style={{ position: "fixed", width: 1, height: 1, opacity: 0, pointerEvents: "none", left: 16, bottom: 16 }} />
    </div>
  );
}
