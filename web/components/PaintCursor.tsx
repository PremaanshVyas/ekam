"use client";

import { useEffect, useRef } from "react";

// A trailing ember brush that follows the pointer — a tapering, glowing ribbon that fades behind
// it. Additive canvas, fixed on top, never blocks clicks. Skips touch devices and reduced-motion.
//
// PERF (why no shadowBlur): ctx.shadowBlur per segment per frame is one of the slowest canvas ops
// and is brutal on Windows (ANGLE/software raster) — it was a major cause of lag + GPU-process
// strain. The glow is now faked cheaply: a 2-pass additive stroke (wide+faint halo, thin+bright
// core) plus a pre-rendered radial-glow sprite for the head. DPR is capped at 1 (a soft glow needs
// no retina buffer), which roughly quarters this canvas's memory + fill cost. Do not re-add shadowBlur.
export default function PaintCursor() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;           // no hover on touch
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = ref.current!; const ctx = cv.getContext("2d")!;
    const dpr = 1;
    let W = 0, H = 0, raf = 0;
    const resize = () => { W = window.innerWidth; H = window.innerHeight; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    // pre-rendered soft glow sprite for the head (drawn with one drawImage — no per-frame blur)
    const glow = document.createElement("canvas"); glow.width = glow.height = 48;
    {
      const g = glow.getContext("2d")!;
      const rad = g.createRadialGradient(24, 24, 0, 24, 24, 24);
      rad.addColorStop(0, "rgba(248,200,120,0.9)");
      rad.addColorStop(0.4, "rgba(232,100,60,0.5)");
      rad.addColorStop(1, "rgba(232,100,60,0)");
      g.fillStyle = rad; g.fillRect(0, 0, 48, 48);
    }
    const pts: { x: number; y: number }[] = [];
    let mx = -9999, my = -9999, lastMove = 0, running = false;
    // PERF: the loop SLEEPS when the cursor is idle (no 60fps clears when nothing moves). A move
    // wakes it; once you stop, the ribbon drains its points then the rAF cancels itself → zero work.
    const wake = () => { if (!running) { running = true; raf = requestAnimationFrame(loop); } };
    const onM = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; lastMove = performance.now(); wake(); };
    window.addEventListener("pointermove", onM); window.addEventListener("resize", resize);
    function loop() {
      const moving = performance.now() - lastMove < 120;
      if (moving) { pts.push({ x: mx, y: my }); if (pts.length > 22) pts.shift(); }
      else if (pts.length) pts.shift();        // idle: drain the trail behind the cursor, then sleep
      ctx.clearRect(0, 0, W, H);
      if (pts.length > 2) {
        ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#e8643c";
        // two additive passes fake a glow without shadowBlur: wide+faint halo, then thin+bright core
        for (let pass = 0; pass < 2; pass++) {
          for (let i = 1; i < pts.length; i++) {
            const t = i / pts.length;
            ctx.globalAlpha = pass === 0 ? 0.10 * t : 0.5 * t;
            ctx.lineWidth = pass === 0 ? (3 + 16 * t * t) : (1 + 7 * t * t);
            ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        const h = pts[pts.length - 1];
        ctx.drawImage(glow, h.x - 16, h.y - 16, 32, 32); // bright head, cheap
        ctx.globalCompositeOperation = "source-over";
      }
      if (!moving && pts.length === 0) { running = false; return; } // nothing left to draw → sleep
      raf = requestAnimationFrame(loop);
    }
    return () => { cancelAnimationFrame(raf); running = false; window.removeEventListener("pointermove", onM); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="paint-cursor" aria-hidden />;
}
