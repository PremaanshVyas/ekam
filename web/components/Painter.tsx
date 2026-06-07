"use client";

import { useEffect, useRef, useState } from "react";
import { submitTile, type SubmitMode } from "@/app/paint/actions";

const SIZE = 512;
const PAPER = "#F3EAD6";

const PALETTE = [
  { name: "paper", hex: "#F3EAD6" }, { name: "ink", hex: "#20201D" },
  { name: "clay", hex: "#C76B4A" }, { name: "rust", hex: "#9C4A33" },
  { name: "honey", hex: "#E0A33E" }, { name: "sage", hex: "#8A9A5B" },
  { name: "pine", hex: "#4F6F52" }, { name: "sky", hex: "#6E94BE" },
  { name: "dusk", hex: "#4E5C8A" }, { name: "plum", hex: "#8A5A78" },
];
const BRUSHES = [6, 14, 26];

const DONE: Record<SubmitMode, { title: string; body: string }> = {
  "new": {
    title: "your tile is in the moderation queue ✦",
    body: "it'll appear on the canvas once it's reviewed. thank you for adding to the canvas.",
  },
  "edit-pending": {
    title: "your changes are saved ✦",
    body: "your tile is in the moderation queue and will appear once it's reviewed.",
  },
  "edit-published": {
    title: "your update is in the moderation queue ✦",
    body: "your current tile stays on the canvas — the update replaces it once it's reviewed.",
  },
};

export default function Painter({
  tileId, x, y, status, initialImage, initialStory,
}: { tileId: string; x: number; y: number; status: string; initialImage: string | null; initialStory: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [hex, setHex] = useState("#C76B4A");
  const [brush, setBrush] = useState(BRUSHES[1]);
  const [erasing, setErasing] = useState(false);
  const [phase, setPhase] = useState<"paint" | "story">("paint");
  const [story, setStory] = useState(initialStory ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [doneMode, setDoneMode] = useState<SubmitMode | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const undo = useRef<ImageData[]>([]);

  const isEditing = status !== "claimed";
  const ctx = () => ref.current?.getContext("2d") ?? null;

  // Initial fill: load the existing art when editing, else blank paper.
  useEffect(() => {
    const c = ctx();
    if (!c) return;
    c.fillStyle = PAPER;
    c.fillRect(0, 0, SIZE, SIZE);
    if (initialImage) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => { const cc = ctx(); if (cc) cc.drawImage(img, 0, 0, SIZE, SIZE); };
      img.onerror = () => { /* leave blank paper if it can't load */ };
      img.src = initialImage;
    }
  }, [initialImage]);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (SIZE / r.width), y: (e.clientY - r.top) * (SIZE / r.height) };
  };
  const snapshot = () => { const c = ctx(); if (!c) return; undo.current.push(c.getImageData(0, 0, SIZE, SIZE)); if (undo.current.length > 20) undo.current.shift(); };
  const paintColor = () => (erasing ? PAPER : hex);

  const down = (e: React.PointerEvent) => {
    const c = ctx(); if (!c) return;
    snapshot(); drawing.current = true;
    const p = pos(e); last.current = p;
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
  const doClear = () => { const c = ctx(); if (!c) return; snapshot(); c.fillStyle = PAPER; c.fillRect(0, 0, SIZE, SIZE); };

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

  const chip = (active: boolean): React.CSSProperties => ({
    fontFamily: "var(--font-ui), sans-serif", fontSize: 14, fontWeight: 500, color: "var(--color-text-secondary)",
    background: active ? "var(--color-bg-surface)" : "var(--color-bg-elevated)",
    border: `1px solid ${active ? "var(--color-border-strong)" : "var(--color-border-default)"}`,
    borderRadius: 9999, padding: "8px 14px", cursor: "pointer",
  });

  if (doneMode) {
    const m = DONE[doneMode];
    return (
      <div style={{ width: "100%", maxWidth: SIZE + 64, background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, padding: 40, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
        <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 30, color: "var(--color-text-primary)", margin: 0, lineHeight: 1.2 }}>{m.title}</p>
        <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 16, color: "var(--color-text-secondary)", margin: 0 }}>{m.body}</p>
        <a href="/" style={{ marginTop: 8, fontFamily: "var(--font-ui), sans-serif", fontSize: 15, fontWeight: 500, color: "var(--color-text-inverse)", background: "var(--palette-ink)", borderRadius: 4, padding: "11px 22px", textDecoration: "none" }}>see the canvas →</a>
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
        style={{ width: "100%", maxWidth: SIZE, aspectRatio: "1 / 1", background: PAPER, border: "1.5px solid var(--color-border-strong)", borderRadius: 2, touchAction: "none", cursor: "crosshair", display: "block" }}
      />

      {phase === "paint" ? (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {PALETTE.map((p) => (
              <button key={p.name} type="button" onClick={() => { setHex(p.hex); setErasing(false); }}
                title={p.name} aria-label={`paint colour ${p.name}`} aria-pressed={!erasing && hex === p.hex}
                style={{ width: 34, height: 34, borderRadius: "50%", background: p.hex, cursor: "pointer", border: !erasing && hex === p.hex ? "3px solid var(--color-text-primary)" : "1px solid var(--color-border-default)" }} />
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-default)", borderRadius: 9999, padding: "8px 12px" }}>
              {BRUSHES.map((b) => (
                <button key={b} type="button" onClick={() => setBrush(b)} aria-label={`brush size ${b === BRUSHES[0] ? "small" : b === BRUSHES[1] ? "medium" : "large"}`} aria-pressed={brush === b} style={{ width: b, height: b, borderRadius: "50%", border: "none", cursor: "pointer", background: brush === b ? "var(--color-text-primary)" : "var(--color-text-muted)" }} />
              ))}
            </div>
            <button type="button" aria-pressed={erasing} style={chip(erasing)} onClick={() => setErasing((e) => !e)}>eraser</button>
            <button type="button" style={chip(false)} onClick={doUndo}>undo</button>
            <button type="button" style={chip(false)} onClick={doClear}>clear</button>
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
