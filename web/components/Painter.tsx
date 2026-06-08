"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { submitTile, type SubmitMode } from "@/app/paint/actions";

const SIZE = 512;
const BG = "#FFFFFF"; // blank canvas — full colour freedom, no theme palette

// A friendly Paint-style starter set; the "any colour" button opens the full spectrum.
const PRESETS = [
  "#000000", "#5C5C5C", "#9AA0A6", "#FFFFFF",
  "#E03B3B", "#F07A29", "#F4C430", "#7DBE3C",
  "#2E8B57", "#1FA6A6", "#2D6CDF", "#243B8F",
  "#7A3FB0", "#E0559E", "#8A5A2B", "#E8B894",
];
const BRUSHES = [4, 12, 24, 40];

type Tool = "brush" | "fill" | "eraser";

const DONE: Record<SubmitMode, { title: string; body: string }> = {
  "new": { title: "your tile is in the moderation queue ✦", body: "it'll appear on the canvas once it's reviewed. thank you for adding to the canvas." },
  "edit-pending": { title: "your changes are saved ✦", body: "your tile is in the moderation queue and will appear once it's reviewed." },
  "edit-published": { title: "your update is in the moderation queue ✦", body: "your current tile stays on the canvas — the update replaces it once it's reviewed." },
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

// Stack flood-fill with a small tolerance (handles anti-aliased edges); `visited`
// guarantees termination. Click on a blank tile fills the whole thing.
function floodFill(ctx: CanvasRenderingContext2D, sxF: number, syF: number, hex: string) {
  const sx = Math.max(0, Math.min(SIZE - 1, Math.floor(sxF)));
  const sy = Math.max(0, Math.min(SIZE - 1, Math.floor(syF)));
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  const s = (sy * SIZE + sx) * 4;
  const tr = d[s], tg = d[s + 1], tb = d[s + 2], ta = d[s + 3];
  const [fr, fg, fb] = hexToRgb(hex);
  const tol = 28;
  const visited = new Uint8Array(SIZE * SIZE);
  const stack: number[] = [sy * SIZE + sx];
  while (stack.length) {
    const p = stack.pop()!;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    if (Math.abs(d[i] - tr) > tol || Math.abs(d[i + 1] - tg) > tol || Math.abs(d[i + 2] - tb) > tol || Math.abs(d[i + 3] - ta) > tol) continue;
    d[i] = fr; d[i + 1] = fg; d[i + 2] = fb; d[i + 3] = 255;
    const x = p % SIZE, y = (p - x) / SIZE;
    if (x + 1 < SIZE) stack.push(p + 1);
    if (x - 1 >= 0) stack.push(p - 1);
    if (y + 1 < SIZE) stack.push(p + SIZE);
    if (y - 1 >= 0) stack.push(p - SIZE);
  }
  ctx.putImageData(img, 0, 0);
}

export default function Painter({
  tileId, x, y, status, initialImage, initialStory,
}: { tileId: string; x: number; y: number; status: string; initialImage: string | null; initialStory: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const colorRef = useRef<HTMLInputElement | null>(null);
  const [hex, setHex] = useState("#1A1A1A");
  const [tool, setTool] = useState<Tool>("brush");
  const [brush, setBrush] = useState(BRUSHES[1]);
  const [phase, setPhase] = useState<"paint" | "story">("paint");
  const [story, setStory] = useState(initialStory ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [doneMode, setDoneMode] = useState<SubmitMode | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const undo = useRef<ImageData[]>([]);

  const isEditing = status !== "claimed";
  const ctx = () => ref.current?.getContext("2d") ?? null;

  useEffect(() => {
    const c = ctx();
    if (!c) return;
    c.fillStyle = BG;
    c.fillRect(0, 0, SIZE, SIZE);
    if (initialImage) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { const cc = ctx(); if (cc) cc.drawImage(img, 0, 0, SIZE, SIZE); };
      img.onerror = () => { /* leave blank if it can't load */ };
      img.src = initialImage;
    }
  }, [initialImage]);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (SIZE / r.width), y: (e.clientY - r.top) * (SIZE / r.height) };
  };
  const snapshot = () => { const c = ctx(); if (!c) return; undo.current.push(c.getImageData(0, 0, SIZE, SIZE)); if (undo.current.length > 25) undo.current.shift(); };
  const paintColor = () => (tool === "eraser" ? BG : hex);

  const down = (e: React.PointerEvent) => {
    const c = ctx(); if (!c) return;
    snapshot();
    const p = pos(e);
    if (tool === "fill") { floodFill(c, p.x, p.y, hex); return; }
    drawing.current = true;
    last.current = p;
    c.fillStyle = paintColor(); c.beginPath(); c.arc(p.x, p.y, brush / 2, 0, Math.PI * 2); c.fill();
    ref.current!.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const c = ctx(); if (!c || !last.current) return;
    const p = pos(e);
    c.strokeStyle = paintColor(); c.lineWidth = brush; c.lineCap = "round"; c.lineJoin = "round";
    c.beginPath(); c.moveTo(last.current.x, last.current.y); c.lineTo(p.x, p.y); c.stroke();
    last.current = p;
  };
  const up = () => { drawing.current = false; last.current = null; };
  const doUndo = () => { const c = ctx(); const img = undo.current.pop(); if (c && img) c.putImageData(img, 0, 0); };
  const doClear = () => { const c = ctx(); if (!c) return; snapshot(); c.fillStyle = BG; c.fillRect(0, 0, SIZE, SIZE); };
  const fillTile = () => { const c = ctx(); if (!c) return; snapshot(); c.fillStyle = hex; c.fillRect(0, 0, SIZE, SIZE); };

  const onSubmit = async () => {
    const c = ref.current; if (!c) return;
    setSubmitting(true);
    try {
      const res = await submitTile(tileId, c.toDataURL("image/png"), story.trim());
      setDoneMode(res.mode);
    } catch (err) {
      setSubmitting(false);
      alert("Couldn't submit — " + (err as Error).message);
    }
  };

  const customActive = tool !== "eraser" && !PRESETS.some((p) => p.toLowerCase() === hex.toLowerCase());
  const toolBtn = (active: boolean): React.CSSProperties => ({
    fontFamily: "var(--font-ui), sans-serif", fontSize: 14, fontWeight: 500,
    color: active ? "var(--color-text-inverse)" : "var(--color-text-secondary)",
    background: active ? "var(--palette-ink)" : "transparent",
    border: "none", borderRadius: 9999, padding: "7px 15px", cursor: "pointer",
  });
  const chip: React.CSSProperties = {
    fontFamily: "var(--font-ui), sans-serif", fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)",
    background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)",
    borderRadius: 9999, padding: "8px 14px", cursor: "pointer",
  };

  if (doneMode) {
    const m = DONE[doneMode];
    return (
      <div style={{ width: "100%", maxWidth: SIZE + 64, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, padding: 40, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 30, color: "var(--color-text-primary)", margin: 0, lineHeight: 1.2 }}>{m.title}</p>
        <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 16, color: "var(--color-text-secondary)", margin: 0 }}>{m.body}</p>
        <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          <Link href="/me" style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 15, fontWeight: 500, color: "var(--color-text-primary)", background: "var(--color-bg-canvas)", border: "1px solid var(--color-border-strong)", borderRadius: 4, padding: "10px 20px", textDecoration: "none" }}>back to your tile</Link>
          <Link href="/" style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 15, fontWeight: 500, color: "var(--color-text-inverse)", background: "var(--palette-ink)", borderRadius: 4, padding: "11px 22px", textDecoration: "none" }}>see the canvas →</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "100%", maxWidth: SIZE + 64, background: "var(--color-bg-canvas)", border: "1px solid var(--color-border-default)", borderRadius: 12, padding: 32, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 34, color: "var(--color-text-primary)" }}>{isEditing ? "edit your tile" : "paint your tile"}</span>
        <span style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-secondary)", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-default)", borderRadius: 9999, padding: "4px 12px", whiteSpace: "nowrap" }}>tile {x},{y}</span>
      </div>

      <canvas
        ref={ref} width={SIZE} height={SIZE}
        role="img" aria-label="your tile — draw your painting here"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
        style={{ width: "100%", maxWidth: SIZE, aspectRatio: "1 / 1", background: BG, border: "1.5px solid var(--color-border-strong)", borderRadius: 2, touchAction: "none", cursor: tool === "fill" ? "cell" : "crosshair", display: "block" }}
      />

      {phase === "paint" ? (
        <>
          {/* colours — presets + full spectrum */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", position: "relative" }}>
            {PRESETS.map((c) => (
              <button key={c} type="button" title={c} aria-label={`colour ${c}`} aria-pressed={tool !== "eraser" && hex.toLowerCase() === c.toLowerCase()}
                onClick={() => { setHex(c); setTool("brush"); }}
                style={{ width: 30, height: 30, borderRadius: "50%", background: c, cursor: "pointer", border: tool !== "eraser" && hex.toLowerCase() === c.toLowerCase() ? "3px solid var(--color-text-primary)" : "1px solid var(--color-border-default)" }} />
            ))}
            <button type="button" title="any colour" aria-label="pick any colour" aria-pressed={customActive} onClick={() => colorRef.current?.click()}
              style={{ width: 30, height: 30, borderRadius: "50%", cursor: "pointer", background: customActive ? hex : "conic-gradient(from 90deg, #f44, #fa3, #fd3, #6c3, #3bb, #36f, #a4f, #f49, #f44)", border: customActive ? "3px solid var(--color-text-primary)" : "1px solid var(--color-border-default)" }} />
            <input ref={colorRef} type="color" value={hex} onChange={(e) => { setHex(e.target.value); setTool("brush"); }} aria-hidden style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none", left: 0, bottom: 0 }} />
          </div>

          {/* tools */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 4, background: "var(--color-bg-surface)", border: "1px solid var(--color-border-default)", borderRadius: 9999, padding: 4 }}>
              <button type="button" onClick={() => setTool("brush")} aria-pressed={tool === "brush"} style={toolBtn(tool === "brush")}>brush</button>
              <button type="button" onClick={() => setTool("fill")} aria-pressed={tool === "fill"} style={toolBtn(tool === "fill")}>fill</button>
              <button type="button" onClick={() => setTool("eraser")} aria-pressed={tool === "eraser"} style={toolBtn(tool === "eraser")}>eraser</button>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-default)", borderRadius: 9999, padding: "8px 12px" }}>
              {BRUSHES.map((b) => (
                <button key={b} type="button" onClick={() => setBrush(b)} aria-label={`brush size ${b}`} aria-pressed={brush === b} style={{ width: Math.min(b, 24), height: Math.min(b, 24), borderRadius: "50%", border: "none", cursor: "pointer", background: brush === b ? "var(--color-text-primary)" : "var(--color-text-muted)" }} />
              ))}
            </div>
            <button type="button" style={chip} onClick={fillTile}>fill tile</button>
            <button type="button" style={chip} onClick={doUndo}>undo</button>
            <button type="button" style={chip} onClick={doClear}>clear</button>
          </div>

          <button onClick={() => setPhase("story")} style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 16, fontWeight: 500, color: "var(--color-text-inverse)", background: "var(--palette-ink)", border: "none", borderRadius: 6, padding: 14, cursor: "pointer", width: "100%" }}>{isEditing ? "next — your story →" : "done — add your story →"}</button>
        </>
      ) : (
        <>
          <label htmlFor="story-input" style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 22, color: "var(--color-text-primary)" }}>where were you when home looked like this?</label>
          <textarea
            id="story-input"
            value={story} onChange={(e) => setStory(e.target.value.slice(0, 140))} maxLength={140} rows={3}
            placeholder="made this at 3am, missing my nani"
            style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--font-ui), sans-serif", fontSize: 16, color: "var(--color-text-primary)", background: "var(--color-bg-surface)", border: "1.5px solid var(--color-border-default)", borderRadius: 8, padding: "12px 16px", outline: "none", resize: "none" }}
          />
          <div style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 12, color: "var(--color-text-muted)", textAlign: "right" }}>{story.length}/140</div>
          {isEditing && status === "published" && (
            <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", margin: 0, lineHeight: 1.5 }}>
              your tile is already on the canvas — this update goes for a quick review before it replaces the current one.
            </p>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={() => setPhase("paint")} style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 15, color: "var(--color-text-secondary)", background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 6, padding: "12px 18px", cursor: "pointer" }}>← back</button>
            <button onClick={onSubmit} disabled={submitting || story.trim().length === 0} style={{ flex: 1, fontFamily: "var(--font-ui), sans-serif", fontSize: 16, fontWeight: 500, color: "var(--color-text-inverse)", background: "var(--palette-ink)", border: "none", borderRadius: 6, padding: 14, cursor: submitting ? "default" : "pointer", opacity: submitting || story.trim().length === 0 ? 0.6 : 1 }}>
              {submitting ? (isEditing ? "saving…" : "stitching in…") : (isEditing ? "save changes" : "stitch it in")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
