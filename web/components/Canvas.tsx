"use client";

import { useRef, useState } from "react";

export type RenderTile = {
  x: number;
  y: number;
  painted: boolean;
  color?: string; // hex (founding tiles) for published tiles
  img?: string; // public storage URL (real submitted tiles)
  story?: string;
  name?: string;
  loc?: string;
};

const CELL = 22;
const GAP = 2;
const PAD = 16;
const VIEW = 620;

const zbtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: "1px solid var(--color-border-default)",
  background: "var(--color-bg-elevated)", color: "var(--color-text-primary)",
  fontFamily: "var(--font-inter), sans-serif", fontSize: 16, cursor: "pointer", lineHeight: 1,
};

export default function Canvas({ tiles, cols = 24 }: { tiles: RenderTile[]; cols?: number }) {
  const inner = cols * CELL + (cols - 1) * GAP;
  const board = inner + PAD * 2;
  const center = (VIEW - board) / 2;

  const [hover, setHover] = useState<number | null>(null);
  const [selected, setSelected] = useState<RenderTile | null>(null);
  const [view, setView] = useState({ scale: 1, tx: center, ty: center });
  const pan = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const moved = useRef(false);

  const onDown = (e: React.PointerEvent) => {
    pan.current = { x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
    moved.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pan.current) return;
    const dx = e.clientX - pan.current.x, dy = e.clientY - pan.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    setView((v) => ({ ...v, tx: pan.current!.tx + dx, ty: pan.current!.ty + dy }));
  };
  const onUp = () => { pan.current = null; };
  const zoom = (f: number) => setView((v) => ({ ...v, scale: Math.min(6, Math.max(1, v.scale * f)) }));
  const reset = () => setView({ scale: 1, tx: center, ty: center });

  const hv = hover != null ? tiles[hover] : null;

  return (
    <div style={{ position: "relative" }}>
      <div
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}
        style={{
          width: VIEW, height: VIEW, maxWidth: "100%", overflow: "hidden",
          background: "var(--color-bg-surface)", borderRadius: 12,
          cursor: pan.current ? "grabbing" : "grab", touchAction: "none",
        }}
      >
        <div
          style={{
            width: board, height: board,
            transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.scale})`,
            transformOrigin: "0 0", padding: PAD, boxSizing: "border-box",
            transition: pan.current ? "none" : "transform .15s ease-out",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${CELL}px)`, gap: GAP, width: inner }}>
            {tiles.map((t, i) => (
              <div
                key={i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                onClick={() => { if (!moved.current && t.painted) setSelected(t); }}
                style={{
                  width: CELL, height: CELL,
                  background: t.painted ? (t.img ? `center/cover url("${t.img}")` : t.color) : "var(--palette-paper)",
                  border: t.painted ? "1px solid var(--color-border-default)" : "1px solid var(--color-pencil)",
                  cursor: t.painted ? "pointer" : "default",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 6 }}>
        <button style={zbtn} onClick={() => zoom(1.3)} aria-label="zoom in">+</button>
        <button style={zbtn} onClick={() => zoom(1 / 1.3)} aria-label="zoom out">−</button>
        <button style={{ ...zbtn, width: "auto", padding: "0 10px", fontSize: 13 }} onClick={reset}>reset</button>
      </div>

      {hv && hv.painted && hv.story && !selected && (
        <div
          style={{
            position: "absolute", left: 12, bottom: 12, maxWidth: 300,
            background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)",
            borderRadius: 8, padding: "10px 14px", boxShadow: "0 4px 16px rgba(32,32,29,.16)", pointerEvents: "none",
          }}
        >
          <div style={{ fontFamily: "var(--font-shantell), cursive", fontSize: 18, color: "var(--color-text-primary)" }}>{hv.story}</div>
          <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>— {hv.name} · click to read</div>
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
            <button
              onClick={() => setSelected(null)}
              style={{ alignSelf: "flex-start", marginTop: 8, fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer" }}
            >
              close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
