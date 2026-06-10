"use client";

import { useRef, useEffect, useCallback } from "react";
import type { Wall, TileInfo } from "@/lib/demoWall";

export type MosaicApi = {
  zoomIn: () => void; zoomOut: () => void; fit: () => void;
  zoomTo: (zoom: "macro" | "mid" | "micro") => void;
  zoomToTile: (idx: number, targetScale?: number) => void;
  getScale: () => number; getZoomLabel: () => string;
};
type ViewMode = "claimed" | "all" | "recent";

function easeInOut(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function scheduleFrame(cb: (t: number) => void): number {
  if (typeof document !== "undefined" && document.hidden) return window.setTimeout(() => cb(performance.now()), 32);
  return requestAnimationFrame(cb);
}

export default function MosaicCanvas({
  wall, version = 0, interactive = false, hero = false, viewMode = "claimed",
  onHover, onSelect, selectedIdx = -1, hoverIdx = -1, initialZoom = "macro", apiRef, accent = "#e8643c",
}: {
  wall: Wall; version?: number; interactive?: boolean; hero?: boolean; viewMode?: ViewMode;
  onHover?: (info: TileInfo | null, x?: number, y?: number) => void;
  onSelect?: (info: TileInfo) => void;
  selectedIdx?: number; hoverIdx?: number; initialZoom?: "macro" | "mid" | "micro";
  apiRef?: React.MutableRefObject<MosaicApi | null>; accent?: string;
}) {
  const GRID = wall.GRID;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const view = useRef({ scale: 6, ox: 0, oy: 0 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const fitScaleRef = useRef(6);
  const rafRef = useRef(0);
  const animRef = useRef<{ from: { scale: number; ox: number; oy: number }; to: { scale: number; ox: number; oy: number }; start: number; dur: number } | null>(null);
  const heroRef = useRef(0);
  const pointer = useRef({ down: false, moved: false, sx: 0, sy: 0, lx: 0, ly: 0, everInteracted: false });
  const stateRef = useRef({ viewMode, selectedIdx, hoverIdx, accent });
  stateRef.current = { viewMode, selectedIdx, hoverIdx, accent };
  const wallRef = useRef(wall); wallRef.current = wall;

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const W = wallRef.current; const dpr = window.devicePixelRatio || 1;
    const { w, h } = sizeRef.current; const { scale, ox, oy } = view.current;
    const { viewMode, selectedIdx, hoverIdx, accent } = stateRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = W.bg; ctx.fillRect(0, 0, w, h);
    const size = GRID * scale;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    if (W.hi) ctx.drawImage(W.hi, ox, oy, size, size);
    if (viewMode === "recent" && W.recent) { ctx.imageSmoothingEnabled = true; ctx.drawImage(W.recent, ox, oy, size, size); }

    const x0 = Math.max(0, Math.floor((0 - ox) / scale));
    const y0 = Math.max(0, Math.floor((0 - oy) / scale));
    const x1 = Math.min(GRID, Math.ceil((w - ox) / scale));
    const y1 = Math.min(GRID, Math.ceil((h - oy) / scale));

    if (viewMode === "all" && scale > 8) {
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(239,233,225,0.07)";
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const idx = y * GRID + x; if (!W.isClaimed(idx)) ctx.strokeRect(ox + x * scale + 0.5, oy + y * scale + 0.5, scale - 1, scale - 1); }
    }
    if (scale > 9) {
      ctx.lineWidth = 1; ctx.strokeStyle = "rgba(10,8,6,0.45)"; ctx.beginPath();
      for (let x = x0; x <= x1; x++) { const px = Math.round(ox + x * scale) + 0.5; ctx.moveTo(px, oy + y0 * scale); ctx.lineTo(px, oy + y1 * scale); }
      for (let y = y0; y <= y1; y++) { const py = Math.round(oy + y * scale) + 0.5; ctx.moveTo(ox + x0 * scale, py); ctx.lineTo(ox + x1 * scale, py); }
      ctx.stroke();
    }
    if (hoverIdx >= 0) {
      const hx = hoverIdx % GRID, hy = (hoverIdx / GRID) | 0; const px = ox + hx * scale, py = oy + hy * scale;
      ctx.fillStyle = "rgba(255,255,255,0.10)"; ctx.fillRect(px, py, scale, scale);
      ctx.lineWidth = Math.max(1.5, scale * 0.06); ctx.strokeStyle = accent; ctx.strokeRect(px + ctx.lineWidth / 2, py + ctx.lineWidth / 2, scale - ctx.lineWidth, scale - ctx.lineWidth);
    }
    if (selectedIdx >= 0) {
      const sx = selectedIdx % GRID, sy = (selectedIdx / GRID) | 0; const px = ox + sx * scale, py = oy + sy * scale;
      ctx.save(); ctx.shadowColor = accent; ctx.shadowBlur = 18; ctx.lineWidth = Math.max(2, scale * 0.08); ctx.strokeStyle = accent; ctx.strokeRect(px, py, scale, scale); ctx.restore();
      if (scale < 10) {
        ctx.strokeStyle = accent; ctx.lineWidth = 1.25; ctx.globalAlpha = 0.55;
        const cxp = px + scale / 2, cyp = py + scale / 2; ctx.beginPath();
        ctx.moveTo(cxp, 0); ctx.lineTo(cxp, py - 6); ctx.moveTo(cxp, py + scale + 6); ctx.lineTo(cxp, h);
        ctx.moveTo(0, cyp); ctx.lineTo(px - 6, cyp); ctx.moveTo(px + scale + 6, cyp); ctx.lineTo(w, cyp); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
  }, [GRID]);

  const requestDraw = useCallback(() => { if (rafRef.current) return; rafRef.current = scheduleFrame(() => { rafRef.current = 0; draw(); }); }, [draw]);
  const clampScale = (s: number) => Math.max(fitScaleRef.current * 0.8, Math.min(140, s));
  const clampPan = useCallback(() => {
    const { w, h } = sizeRef.current; const v = view.current; const size = GRID * v.scale; const margin = Math.min(w, h) * 0.4;
    v.ox = Math.min(margin, Math.max(w - size - margin, v.ox)); v.oy = Math.min(margin, Math.max(h - size - margin, v.oy));
  }, [GRID]);
  const presetScale = useCallback((zoom: string) => { const fit = fitScaleRef.current; if (zoom === "mid") return fit * 2.4; if (zoom === "micro") return 96; return fit; }, []);
  const centerOn = useCallback((tileX: number, tileY: number, scale: number) => { const { w, h } = sizeRef.current; return { scale, ox: w / 2 - tileX * scale, oy: h / 2 - tileY * scale }; }, []);
  const animateTo = useCallback((target: { scale: number; ox: number; oy: number }, dur = 720) => {
    animRef.current = { from: { ...view.current }, to: target, start: performance.now(), dur };
    const tick = (now: number) => {
      const a = animRef.current; if (!a) return; const t = Math.min(1, (now - a.start) / a.dur); const e = easeInOut(t);
      view.current = { scale: a.from.scale + (a.to.scale - a.from.scale) * e, ox: a.from.ox + (a.to.ox - a.from.ox) * e, oy: a.from.oy + (a.to.oy - a.from.oy) * e };
      draw(); if (t < 1) scheduleFrame(tick); else animRef.current = null;
    };
    scheduleFrame(tick);
  }, [draw]);
  const setFit = useCallback((zoom = "macro") => { const s = presetScale(zoom); view.current = centerOn((GRID - 1) / 2, (GRID - 1) / 2, s); clampPan(); requestDraw(); }, [GRID, presetScale, centerOn, clampPan, requestDraw]);

  function zoomAround(v: { scale: number; ox: number; oy: number }, ns: number, cx: number, cy: number) {
    const tileX = (cx - v.ox) / v.scale, tileY = (cy - v.oy) / v.scale; return { scale: ns, ox: cx - tileX * ns, oy: cy - tileY * ns };
  }

  useEffect(() => {
    const canvas = canvasRef.current!, wrap = wrapRef.current!;
    const resize = () => {
      const r = wrap.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: r.width, h: r.height };
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
      const margin = hero ? 0.96 : 0.82; fitScaleRef.current = Math.min(r.width, r.height) * margin / GRID;
      if (!pointer.current.everInteracted) setFit(initialZoom); else requestDraw();
    };
    const ro = new ResizeObserver(resize); ro.observe(wrap); resize();
    return () => ro.disconnect();
  }, [GRID, hero, initialZoom, setFit, requestDraw]);

  useEffect(() => { requestDraw(); }, [version, viewMode, selectedIdx, hoverIdx, accent, requestDraw]);

  // hero Ken Burns autoplay
  useEffect(() => {
    if (!hero) return; let running = true; const start = performance.now();
    const loop = (now: number) => {
      if (!running) return; const t = (now - start) / 1000; const fit = fitScaleRef.current;
      const zoomT = (Math.sin(t * 0.16) + 1) / 2; const scale = fit * (1.15 + zoomT * 1.6);
      const panX = Math.sin(t * 0.11) * 0.16 + 0.5; const panY = Math.cos(t * 0.09) * 0.10 + 0.52;
      view.current = centerOn(panX * GRID, panY * GRID, scale); draw(); heroRef.current = scheduleFrame(loop);
    };
    heroRef.current = scheduleFrame(loop);
    return () => { running = false; cancelAnimationFrame(heroRef.current); clearTimeout(heroRef.current); };
  }, [hero, GRID, centerOn, draw, version]);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = {
      zoomIn() { pointer.current.everInteracted = true; const v = view.current; const ns = clampScale(v.scale * 1.6); animateTo(zoomAround(v, ns, sizeRef.current.w / 2, sizeRef.current.h / 2), 380); },
      zoomOut() { pointer.current.everInteracted = true; const v = view.current; const ns = clampScale(v.scale / 1.6); animateTo(zoomAround(v, ns, sizeRef.current.w / 2, sizeRef.current.h / 2), 380); },
      fit() { pointer.current.everInteracted = true; const s = presetScale("macro"); animateTo(centerOn((GRID - 1) / 2, (GRID - 1) / 2, s), 620); },
      zoomTo(zoom) { pointer.current.everInteracted = true; const s = presetScale(zoom); animateTo(centerOn((GRID - 1) / 2, (GRID - 1) / 2, s), 620); },
      zoomToTile(idx, targetScale = 30) { pointer.current.everInteracted = true; const tx = (idx % GRID) + 0.5, ty = ((idx / GRID) | 0) + 0.5; animateTo(centerOn(tx, ty, clampScale(targetScale)), 720); },
      getScale() { return view.current.scale; },
      getZoomLabel() { const s = view.current.scale, fit = fitScaleRef.current; if (s > fit * 3) return "Micro"; if (s > fit * 1.7) return "Mid"; return "Macro"; },
    };
  }, [apiRef, GRID, animateTo, centerOn, presetScale]);

  const tileAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current!; const r = canvas.getBoundingClientRect(); const v = view.current;
    const tx = Math.floor((clientX - r.left - v.ox) / v.scale); const ty = Math.floor((clientY - r.top - v.oy) / v.scale);
    if (tx < 0 || ty < 0 || tx >= GRID || ty >= GRID) return -1; return ty * GRID + tx;
  }, [GRID]);

  useEffect(() => {
    if (!interactive) return; const canvas = canvasRef.current!; const W = () => wallRef.current;
    const onDown = (e: PointerEvent) => { animRef.current = null; pointer.current = { ...pointer.current, down: true, moved: false, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, everInteracted: true }; canvas.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      const p = pointer.current;
      if (p.down) {
        const dx = e.clientX - p.lx, dy = e.clientY - p.ly; view.current.ox += dx; view.current.oy += dy; p.lx = e.clientX; p.ly = e.clientY;
        if (Math.abs(e.clientX - p.sx) + Math.abs(e.clientY - p.sy) > 4) p.moved = true; clampPan(); requestDraw(); onHover?.(null);
      } else { const idx = tileAt(e.clientX, e.clientY); onHover?.(idx >= 0 ? W().infoFor(idx) : null, e.clientX, e.clientY); }
    };
    const onUp = (e: PointerEvent) => { const p = pointer.current; if (p.down && !p.moved) { const idx = tileAt(e.clientX, e.clientY); if (idx >= 0) onSelect?.(W().infoFor(idx)); } p.down = false; };
    const onLeave = () => onHover?.(null);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); animRef.current = null; pointer.current.everInteracted = true;
      const r = canvas.getBoundingClientRect(); const v = view.current; const factor = Math.exp(-e.deltaY * 0.0016); const ns = clampScale(v.scale * factor);
      view.current = zoomAround(v, ns, e.clientX - r.left, e.clientY - r.top); clampPan(); requestDraw();
      const idx = tileAt(e.clientX, e.clientY); onHover?.(idx >= 0 ? W().infoFor(idx) : null, e.clientX, e.clientY);
    };
    const onDbl = (e: MouseEvent) => { const idx = tileAt(e.clientX, e.clientY); if (idx >= 0) { pointer.current.everInteracted = true; const tx = (idx % GRID) + 0.5, ty = ((idx / GRID) | 0) + 0.5; animateTo(centerOn(tx, ty, clampScale(34)), 600); } };
    canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointerleave", onLeave); canvas.addEventListener("wheel", onWheel, { passive: false }); canvas.addEventListener("dblclick", onDbl);
    return () => {
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointerleave", onLeave); canvas.removeEventListener("wheel", onWheel); canvas.removeEventListener("dblclick", onDbl);
    };
  }, [interactive, tileAt, clampPan, requestDraw, animateTo, centerOn, onHover, onSelect, GRID]);

  return (
    <div ref={wrapRef} className="mc-wrap" style={{ cursor: interactive ? "crosshair" : "default" }}>
      <canvas ref={canvasRef} className="mc-canvas" />
    </div>
  );
}
