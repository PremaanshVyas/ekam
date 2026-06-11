"use client";

import { useRef, useEffect, useCallback } from "react";
import type { Wall, TileInfo } from "@/lib/demoWall";

export type MosaicApi = {
  zoomIn: () => void; zoomOut: () => void; fit: () => void;
  zoomTo: (zoom: "macro" | "mid" | "micro") => void;
  zoomToTile: (idx: number, targetScale?: number) => void;
  getScale: () => number; getZoomLabel: () => string;
};
export type Insets = { top: number; right: number; bottom: number; left: number };
type ViewMode = "claimed" | "all" | "recent";

const ZERO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

function easeInOut(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function scheduleFrame(cb: (t: number) => void): number {
  if (typeof document !== "undefined" && document.hidden) return window.setTimeout(() => cb(performance.now()), 32);
  return requestAnimationFrame(cb);
}
const dprCap = () => Math.min(2, (typeof window !== "undefined" && window.devicePixelRatio) || 1);

export default function MosaicCanvas({
  wall, version = 0, interactive = false, hero = false, viewMode = "claimed",
  onHover, onSelect, selectedIdx = -1, hoverIdx = -1, initialZoom = "macro", apiRef, accent = "#e8643c", grid = false,
  insets, seamless = false,
}: {
  wall: Wall; version?: number; interactive?: boolean; hero?: boolean; viewMode?: ViewMode;
  onHover?: (info: TileInfo | null, x?: number, y?: number) => void;
  onSelect?: (info: TileInfo) => void;
  selectedIdx?: number; hoverIdx?: number; initialZoom?: "macro" | "mid" | "micro";
  apiRef?: React.MutableRefObject<MosaicApi | null>; accent?: string; grid?: boolean;
  insets?: Insets; seamless?: boolean;
}) {
  const GRID = wall.GRID;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const view = useRef({ scale: 6, ox: 0, oy: 0 });
  const sizeRef = useRef({ w: 0, h: 0 });
  const insetsRef = useRef<Insets>(insets ?? ZERO_INSETS);
  insetsRef.current = insets ?? ZERO_INSETS;
  const fitScaleRef = useRef(6);
  const rafRef = useRef(0);
  const animRef = useRef<{ from: { scale: number; ox: number; oy: number }; to: { scale: number; ox: number; oy: number }; start: number; dur: number } | null>(null);
  const heroRef = useRef(0);
  const pointer = useRef({ down: false, moved: false, sx: 0, sy: 0, lx: 0, ly: 0, type: "mouse", everInteracted: false });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ d0: number; cx0: number; cy0: number; v0: { scale: number; ox: number; oy: number } } | null>(null);
  const stateRef = useRef({ viewMode, selectedIdx, hoverIdx, accent, grid, seamless });
  stateRef.current = { viewMode, selectedIdx, hoverIdx, accent, grid, seamless };
  const wallRef = useRef(wall); wallRef.current = wall;

  // available (non-chrome-covered) rect, in CSS px
  const avail = useCallback(() => {
    const { w, h } = sizeRef.current; const i = insetsRef.current;
    return { x: i.left, y: i.top, w: Math.max(40, w - i.left - i.right), h: Math.max(40, h - i.top - i.bottom) };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const W = wallRef.current; const dpr = dprCap();
    const { w, h } = sizeRef.current; const { scale, ox, oy } = view.current;
    const { viewMode, selectedIdx, hoverIdx, accent, grid, seamless } = stateRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = W.bg; ctx.fillRect(0, 0, w, h);
    const size = GRID * scale;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";

    const x0 = Math.max(0, Math.floor((0 - ox) / scale));
    const y0 = Math.max(0, Math.floor((0 - oy) / scale));
    const x1 = Math.min(GRID, Math.ceil((w - ox) / scale));
    const y1 = Math.min(GRID, Math.ceil((h - oy) / scale));

    const complete = W.N_TOTAL > 0 && W.claimedCount >= W.N_TOTAL;
    const gridded = grid && !seamless && !complete && scale >= 5;
    const gap = gridded ? Math.max(1, scale * 0.06) : 0;

    if (!gridded) {
      if (W.hi) ctx.drawImage(W.hi, ox, oy, size, size); // seamless: hero, far-out zoom, or complete
    } else {
      // distinct tiles with grout gaps (cream-style) — dark bg shows between them
      const t = W.TILE_PX;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const dx = ox + x * scale, dy = oy + y * scale;
        if (W.hi) ctx.drawImage(W.hi, x * t, y * t, t, t, dx + gap / 2, dy + gap / 2, scale - gap, scale - gap);
      }
    }
    if (viewMode === "recent" && W.recent) ctx.drawImage(W.recent, ox, oy, size, size);

    if (gridded) {
      // light grout borders so every cell (even empty) reads as a tile in the grid
      ctx.lineWidth = 1;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const claimed = W.isClaimed(y * GRID + x);
        ctx.strokeStyle = claimed ? "rgba(239,233,225,0.18)" : (viewMode === "all" ? "rgba(239,233,225,0.18)" : "rgba(239,233,225,0.10)");
        ctx.strokeRect(ox + x * scale + gap / 2 + 0.5, oy + y * scale + gap / 2 + 0.5, scale - gap - 1, scale - gap - 1);
      }
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
    const a = avail(); const v = view.current; const size = GRID * v.scale; const margin = Math.min(a.w, a.h) * 0.4;
    v.ox = Math.min(a.x + margin, Math.max(a.x + a.w - size - margin, v.ox));
    v.oy = Math.min(a.y + margin, Math.max(a.y + a.h - size - margin, v.oy));
  }, [GRID, avail]);
  const presetScale = useCallback((zoom: string) => { const fit = fitScaleRef.current; if (zoom === "mid") return fit * 2.4; if (zoom === "micro") return 96; return fit; }, []);
  const centerOn = useCallback((tileX: number, tileY: number, scale: number) => {
    const a = avail(); return { scale, ox: a.x + a.w / 2 - tileX * scale, oy: a.y + a.h / 2 - tileY * scale };
  }, [avail]);
  const animateTo = useCallback((target: { scale: number; ox: number; oy: number }, dur = 720) => {
    animRef.current = { from: { ...view.current }, to: target, start: performance.now(), dur };
    const tick = (now: number) => {
      const a = animRef.current; if (!a) return; const t = Math.min(1, (now - a.start) / a.dur); const e = easeInOut(t);
      view.current = { scale: a.from.scale + (a.to.scale - a.from.scale) * e, ox: a.from.ox + (a.to.ox - a.from.ox) * e, oy: a.from.oy + (a.to.oy - a.from.oy) * e };
      draw(); if (t < 1) scheduleFrame(tick); else animRef.current = null;
    };
    scheduleFrame(tick);
  }, [draw]);
  const computeFitScale = useCallback(() => {
    const a = avail(); const margin = hero ? 0.96 : 0.94;
    return Math.min(a.w, a.h) * margin / GRID;
  }, [avail, hero, GRID]);
  const setFit = useCallback((zoom = "macro") => { fitScaleRef.current = computeFitScale(); const s = presetScale(zoom); view.current = centerOn((GRID - 1) / 2 + 0.5, (GRID - 1) / 2 + 0.5, s); requestDraw(); }, [GRID, presetScale, centerOn, requestDraw, computeFitScale]);

  function zoomAround(v: { scale: number; ox: number; oy: number }, ns: number, cx: number, cy: number) {
    const tileX = (cx - v.ox) / v.scale, tileY = (cy - v.oy) / v.scale; return { scale: ns, ox: cx - tileX * ns, oy: cy - tileY * ns };
  }

  useEffect(() => {
    const canvas = canvasRef.current!, wrap = wrapRef.current!;
    const resize = () => {
      const r = wrap.getBoundingClientRect(); const dpr = dprCap();
      sizeRef.current = { w: r.width, h: r.height };
      canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
      canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px";
      fitScaleRef.current = computeFitScale();
      if (!pointer.current.everInteracted) setFit(initialZoom); else { clampPan(); requestDraw(); }
    };
    const ro = new ResizeObserver(resize); ro.observe(wrap); resize();
    return () => ro.disconnect();
  }, [GRID, hero, initialZoom, setFit, requestDraw, computeFitScale, clampPan]);

  // chrome insets changed (sidebar/panel toggled) → refit or recenter smoothly
  const prevInsetsRef = useRef<Insets>(insets ?? ZERO_INSETS);
  useEffect(() => {
    const prev = prevInsetsRef.current; const next = insets ?? ZERO_INSETS;
    if (prev.top === next.top && prev.right === next.right && prev.bottom === next.bottom && prev.left === next.left) return;
    const oldFit = fitScaleRef.current;
    const wasAtFit = Math.abs(view.current.scale - oldFit) < oldFit * 0.08;
    const dcx = ((next.left - prev.left) - (next.right - prev.right)) / 2;
    const dcy = ((next.top - prev.top) - (next.bottom - prev.bottom)) / 2;
    prevInsetsRef.current = next;
    fitScaleRef.current = computeFitScale();
    if (!pointer.current.everInteracted || wasAtFit) {
      const s = fitScaleRef.current;
      animateTo(centerOn((GRID - 1) / 2 + 0.5, (GRID - 1) / 2 + 0.5, s), 360);
    } else {
      animateTo({ scale: view.current.scale, ox: view.current.ox + dcx, oy: view.current.oy + dcy }, 300);
    }
  }, [insets, GRID, animateTo, centerOn, computeFitScale]);

  useEffect(() => { requestDraw(); }, [version, viewMode, selectedIdx, hoverIdx, accent, seamless, requestDraw]);

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
      zoomIn() { pointer.current.everInteracted = true; const v = view.current; const ns = clampScale(v.scale * 1.6); const a = avail(); animateTo(zoomAround(v, ns, a.x + a.w / 2, a.y + a.h / 2), 380); },
      zoomOut() { pointer.current.everInteracted = true; const v = view.current; const ns = clampScale(v.scale / 1.6); const a = avail(); animateTo(zoomAround(v, ns, a.x + a.w / 2, a.y + a.h / 2), 380); },
      fit() { pointer.current.everInteracted = true; const s = presetScale("macro"); animateTo(centerOn((GRID - 1) / 2 + 0.5, (GRID - 1) / 2 + 0.5, s), 620); },
      zoomTo(zoom) { pointer.current.everInteracted = true; const s = presetScale(zoom); animateTo(centerOn((GRID - 1) / 2 + 0.5, (GRID - 1) / 2 + 0.5, s), 620); },
      zoomToTile(idx, targetScale = 30) { pointer.current.everInteracted = true; const tx = (idx % GRID) + 0.5, ty = ((idx / GRID) | 0) + 0.5; animateTo(centerOn(tx, ty, clampScale(targetScale)), 720); },
      getScale() { return view.current.scale; },
      getZoomLabel() { const s = view.current.scale, fit = fitScaleRef.current; if (s > fit * 3) return "Micro"; if (s > fit * 1.7) return "Mid"; return "Macro"; },
    };
  }, [apiRef, GRID, animateTo, centerOn, presetScale, avail]);

  const tileAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current!; const r = canvas.getBoundingClientRect(); const v = view.current;
    const tx = Math.floor((clientX - r.left - v.ox) / v.scale); const ty = Math.floor((clientY - r.top - v.oy) / v.scale);
    if (tx < 0 || ty < 0 || tx >= GRID || ty >= GRID) return -1; return ty * GRID + tx;
  }, [GRID]);

  useEffect(() => {
    if (!interactive) return; const canvas = canvasRef.current!; const W = () => wallRef.current;
    const ptrs = pointersRef.current;

    const onDown = (e: PointerEvent) => {
      animRef.current = null;
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) {
        // second finger → switch from pan/tap to pinch-zoom
        pointer.current.down = false; pointer.current.moved = true; pointer.current.everInteracted = true;
        onHover?.(null);
        const [a, b] = [...ptrs.values()]; const r = canvas.getBoundingClientRect();
        pinchRef.current = {
          d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          cx0: (a.x + b.x) / 2 - r.left, cy0: (a.y + b.y) / 2 - r.top,
          v0: { ...view.current },
        };
        return;
      }
      if (ptrs.size > 2) return;
      pointer.current = { ...pointer.current, down: true, moved: false, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, type: e.pointerType, everInteracted: true };
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not critical */ }
    };
    const onMove = (e: PointerEvent) => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pinch = pinchRef.current;
      if (pinch && ptrs.size >= 2) {
        const [a, b] = [...ptrs.values()]; const r = canvas.getBoundingClientRect();
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const ns = clampScale(pinch.v0.scale * (d / pinch.d0));
        const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
        // anchor: the wall point under the starting centroid follows the moving centroid
        const tileX = (pinch.cx0 - pinch.v0.ox) / pinch.v0.scale, tileY = (pinch.cy0 - pinch.v0.oy) / pinch.v0.scale;
        view.current = { scale: ns, ox: cx - tileX * ns, oy: cy - tileY * ns };
        clampPan(); requestDraw();
        return;
      }
      const p = pointer.current;
      if (p.down) {
        const dx = e.clientX - p.lx, dy = e.clientY - p.ly; view.current.ox += dx; view.current.oy += dy; p.lx = e.clientX; p.ly = e.clientY;
        const slop = p.type === "touch" ? 10 : 4; // finger jitter must not eat taps
        if (Math.abs(e.clientX - p.sx) + Math.abs(e.clientY - p.sy) > slop) p.moved = true;
        clampPan(); requestDraw(); onHover?.(null);
      } else if (e.pointerType === "mouse") {
        const idx = tileAt(e.clientX, e.clientY); onHover?.(idx >= 0 ? W().infoFor(idx) : null, e.clientX, e.clientY);
      }
    };
    const endPointer = (e: PointerEvent) => {
      ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinchRef.current = null;
    };
    const onUp = (e: PointerEvent) => {
      const wasPinching = !!pinchRef.current;
      endPointer(e);
      const p = pointer.current;
      if (!wasPinching && p.down && !p.moved) { const idx = tileAt(e.clientX, e.clientY); if (idx >= 0) onSelect?.(W().infoFor(idx)); }
      p.down = false;
    };
    const onCancel = (e: PointerEvent) => { endPointer(e); pointer.current.down = false; };
    const onLeave = () => onHover?.(null);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); animRef.current = null; pointer.current.everInteracted = true;
      const r = canvas.getBoundingClientRect(); const v = view.current; const factor = Math.exp(-e.deltaY * 0.0016); const ns = clampScale(v.scale * factor);
      view.current = zoomAround(v, ns, e.clientX - r.left, e.clientY - r.top); clampPan(); requestDraw();
      const idx = tileAt(e.clientX, e.clientY); onHover?.(idx >= 0 ? W().infoFor(idx) : null, e.clientX, e.clientY);
    };
    const onDbl = (e: MouseEvent) => { const idx = tileAt(e.clientX, e.clientY); if (idx >= 0) { pointer.current.everInteracted = true; const tx = (idx % GRID) + 0.5, ty = ((idx / GRID) | 0) + 0.5; animateTo(centerOn(tx, ty, clampScale(34)), 600); } };
    canvas.addEventListener("pointerdown", onDown); canvas.addEventListener("pointermove", onMove); canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("pointerleave", onLeave); canvas.addEventListener("wheel", onWheel, { passive: false }); canvas.addEventListener("dblclick", onDbl);
    return () => {
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove); canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("pointerleave", onLeave); canvas.removeEventListener("wheel", onWheel); canvas.removeEventListener("dblclick", onDbl);
    };
  }, [interactive, tileAt, clampPan, requestDraw, animateTo, centerOn, onHover, onSelect, GRID]);

  return (
    <div ref={wrapRef} className="mc-wrap" style={{ cursor: interactive ? "crosshair" : "default" }}>
      <canvas ref={canvasRef} className="mc-canvas" />
    </div>
  );
}
