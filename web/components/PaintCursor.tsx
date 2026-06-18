"use client";

import { useEffect, useRef } from "react";

// A trailing ember brush that follows the pointer — the cursor "paints" a tapering,
// glowing ribbon that fades behind it. Additive canvas, fixed on top, never blocks clicks.
// Skips touch devices (no hover/pointer there).
export default function PaintCursor() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const cv = ref.current!; const ctx = cv.getContext("2d")!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0, raf = 0;
    const resize = () => { W = window.innerWidth; H = window.innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize();
    const pts: { x: number; y: number }[] = [];
    let mx = -9999, my = -9999, has = false;
    const onM = (e: PointerEvent) => { mx = e.clientX; my = e.clientY; has = true; };
    window.addEventListener("pointermove", onM); window.addEventListener("resize", resize);
    const loop = () => {
      if (has) { pts.push({ x: mx, y: my }); if (pts.length > 26) pts.shift(); }
      ctx.clearRect(0, 0, W, H);
      if (pts.length > 2) {
        ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (let i = 1; i < pts.length; i++) {
          const t = i / pts.length;
          ctx.strokeStyle = `rgba(232,100,60,${0.5 * t})`;
          ctx.shadowBlur = 14 * t; ctx.shadowColor = "#e8643c";
          ctx.lineWidth = 1 + 11 * t * t;
          ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
        }
        const h = pts[pts.length - 1];
        ctx.shadowBlur = 18; ctx.fillStyle = "rgba(248,200,120,.9)";
        ctx.beginPath(); ctx.arc(h.x, h.y, 4.5, 0, 6.28); ctx.fill();
        ctx.shadowBlur = 0; ctx.globalCompositeOperation = "source-over";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("pointermove", onM); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="paint-cursor" aria-hidden />;
}
