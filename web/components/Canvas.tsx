"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RenderTile = {
  x: number;
  y: number;
  painted: boolean;
  color?: string; // hex (founding tiles)
  img?: string; // public storage URL (real tiles)
  story?: string;
  name?: string;
  loc?: string;
};

const R = 80; // internal px per tile (crispness)
const VIEW = 640; // displayed viewport size
const PAPER = "#F3EAD6";
const SURFACE = "#EBDFC7";

const zbtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: "1px solid var(--color-border-default)",
  background: "var(--color-bg-elevated)", color: "var(--color-text-primary)",
  fontFamily: "var(--font-inter), sans-serif", fontSize: 16, cursor: "pointer", lineHeight: 1,
};

export default function Canvas({ tiles, cols = 24 }: { tiles: RenderTile[]; cols?: number }) {
  const rows = Math.max(1, Math.round(tiles.length / cols));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgs = useRef<Map<string, HTMLImageElement>>(new Map());
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [hover, setHover] = useState<{ tile: RenderTile; sx: number; sy: number } | null>(null);
  const [selected, setSelected] = useState<RenderTile | null>(null);
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const moved = useRef(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const vpSize = () => viewportRef.current?.clientWidth ?? VIEW;
  const clamp = (v: { scale: number; tx: number; ty: number }) => {
    const min = vpSize() * (1 - v.scale); // keep the canvas covering the viewport
    return { scale: v.scale, tx: Math.min(0, Math.max(min, v.tx)), ty: Math.min(0, Math.max(min, v.ty)) };
  };

  // Wheel-to-zoom toward the cursor (native listener so we can preventDefault).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const size = el.clientWidth;
      setView((v) => {
        const ns = Math.min(7, Math.max(1, v.scale * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
        const k = ns / v.scale;
        const min = size * (1 - ns);
        return {
          scale: ns,
          tx: Math.min(0, Math.max(min, mx - (mx - v.tx) * k)),
          ty: Math.min(0, Math.max(min, my - (my - v.ty) * k)),
        };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, c.width, c.height);
    for (const t of tiles) {
      if (!t.painted) continue; // open cells stay paper — seamless, no border
      const px = t.x * R;
      const py = t.y * R;
      if (t.img) {
        const im = imgs.current.get(t.img);
        if (im && im.complete && im.naturalWidth) ctx.drawImage(im, px, py, R, R);
        else { ctx.fillStyle = SURFACE; ctx.fillRect(px, py, R, R); }
      } else if (t.color) {
        ctx.fillStyle = t.color;
        ctx.fillRect(px, py, R, R);
      }
    }
  }, [tiles]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = cols * R;
    c.height = rows * R;
    let alive = true;
    for (const t of tiles) {
      if (t.painted && t.img && !imgs.current.has(t.img)) {
        const im = new Image();
        im.onload = () => { if (alive) draw(); };
        im.src = t.img;
        imgs.current.set(t.img, im);
      }
    }
    draw();
    return () => { alive = false; };
  }, [tiles, cols, rows, draw]);

  const cellAt = (clientX: number, clientY: number): RenderTile | null => {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect(); // reflects current transform — maps at any zoom/pan
    const cx = Math.floor(((clientX - rect.left) / rect.width) * cols);
    const cy = Math.floor(((clientY - rect.top) / rect.height) * rows);
    if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return null;
    return tiles[cy * cols + cx] ?? null;
  };

  const onDown = (e: React.PointerEvent) => {
    pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    moved.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (pan.current) {
      const dx = e.clientX - pan.current.x;
      const dy = e.clientY - pan.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
      setView((v) => clamp({ scale: v.scale, tx: pan.current!.tx + dx, ty: pan.current!.ty + dy }));
      return;
    }
    const t = cellAt(e.clientX, e.clientY);
    if (t && t.painted && t.story) setHover({ tile: t, sx: e.clientX, sy: e.clientY });
    else setHover(null);
  };
  const onUp = () => { pan.current = null; };
  const onClick = (e: React.MouseEvent) => {
    if (moved.current) return;
    const t = cellAt(e.clientX, e.clientY);
    if (t && t.painted) setSelected(t);
  };
  const zoom = (f: number) =>
    setView((v) => {
      const c = vpSize() / 2;
      const ns = Math.min(7, Math.max(1, v.scale * f));
      const k = ns / v.scale;
      return clamp({ scale: ns, tx: c - (c - v.tx) * k, ty: c - (c - v.ty) * k });
    });
  const reset = () => setView({ scale: 1, tx: 0, ty: 0 });

  return (
    <div style={{ position: "relative", width: VIEW, maxWidth: "100%" }}>
      <div
        ref={viewportRef}
        style={{
          width: "100%", aspectRatio: "1 / 1", overflow: "hidden",
          background: "var(--color-bg-surface)", borderRadius: 14,
          cursor: pan.current ? "grabbing" : "grab", touchAction: "none",
        }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => { onUp(); setHover(null); }}
        onClick={onClick}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: "100%", height: "100%", display: "block",
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            transformOrigin: "0 0",
            transition: pan.current ? "none" : "transform .18s ease-out",
          }}
        />
      </div>

      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}>
        <button style={zbtn} onClick={() => zoom(1.35)} aria-label="zoom in">+</button>
        <button style={zbtn} onClick={() => zoom(1 / 1.35)} aria-label="zoom out">−</button>
        <button style={{ ...zbtn, width: "auto", padding: "0 10px", fontSize: 13 }} onClick={reset}>reset</button>
      </div>

      {hover && !selected && (
        <div
          style={{
            position: "fixed",
            left: Math.min(hover.sx + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 300),
            top: hover.sy + 14, maxWidth: 280,
            background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)",
            borderRadius: 8, padding: "10px 14px", boxShadow: "0 4px 16px rgba(32,32,29,.16)",
            pointerEvents: "none", zIndex: 40,
          }}
        >
          <div style={{ fontFamily: "var(--font-shantell), cursive", fontSize: 18, color: "var(--color-text-primary)" }}>{hover.tile.story}</div>
          <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>— {hover.tile.name} · click to read</div>
        </div>
      )}

      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(32,32,29,.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: 340, maxWidth: "90vw", background: "var(--color-bg-elevated)", borderRadius: 12, padding: 24, boxShadow: "0 10px 30px rgba(32,32,29,.3)", display: "flex", flexDirection: "column", gap: 8 }}
          >
            <div style={{ width: 120, height: 120, borderRadius: 6, background: selected.img ? `center/cover url("${selected.img}")` : selected.color, border: "1px solid var(--color-border-default)" }} />
            <div style={{ fontFamily: "var(--font-shantell), cursive", fontSize: 20, color: "var(--color-text-primary)", lineHeight: 1.3 }}>{selected.story}</div>
            <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, color: "var(--color-text-secondary)" }}>
              — {selected.name}{selected.loc ? ` · ${selected.loc}` : ""}
            </div>
            <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--color-text-muted)" }}>tile {selected.x},{selected.y} · published</div>
            <button onClick={() => setSelected(null)} style={{ alignSelf: "flex-start", marginTop: 8, fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer" }}>close</button>
          </div>
        </div>
      )}
    </div>
  );
}
