"use client";

import { useEffect, useRef } from "react";

// Ambient ember field — warm motes drifting up, additively blended so they only add light,
// gently warmed + nudged toward the cursor. Pure canvas (cached glow sprites, "lighter"
// compositing) so 60–90 particles stay smooth. Fixed behind the content.
const COLORS = ["#e8643c", "#e0a23a", "#f5832a", "#c2563c", "#f6a623"];

export default function Embers({ density = 0.00006, opacity = 0.85 }: { density?: number; opacity?: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = ref.current!; const ctx = cv.getContext("2d")!;
    const dpr = 1; // soft glow overlay — DPR 1 keeps memory + fill-rate low (smooth on weak Windows GPUs)
    let W = 0, H = 0, raf = 0;
    const sprite = (col: string) => {
      const s = document.createElement("canvas"); s.width = s.height = 32;
      const g = s.getContext("2d")!; const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      grad.addColorStop(0, col); grad.addColorStop(0.35, col + "aa"); grad.addColorStop(1, col + "00");
      g.fillStyle = grad; g.fillRect(0, 0, 32, 32); return s;
    };
    const sprites = COLORS.map(sprite);
    type P = { x: number; y: number; r: number; vy: number; vx: number; a: number; ph: number; s: HTMLCanvasElement };
    let ps: P[] = [];
    const mouse = { x: -9999, y: -9999, on: false };
    const make = (): P => ({ x: Math.random() * W, y: Math.random() * H, r: 2 + Math.random() * 9, vy: 4 + Math.random() * 16, vx: (Math.random() - 0.5) * 6, a: 0.12 + Math.random() * 0.5, ph: Math.random() * 6.28, s: sprites[(Math.random() * sprites.length) | 0] });
    const resize = () => { W = window.innerWidth; H = window.innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ps = Array.from({ length: Math.round(W * H * density) }, make); };
    resize();
    const onR = () => resize();
    const onM = (e: PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.on = true; };
    window.addEventListener("resize", onR); window.addEventListener("pointermove", onM);
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      ctx.clearRect(0, 0, W, H); ctx.globalCompositeOperation = "lighter";
      for (const p of ps) {
        p.ph += dt * 1.6; p.y -= p.vy * dt; p.x += (p.vx + Math.sin(p.ph) * 8) * dt;
        let glow = p.a * (0.6 + 0.4 * Math.sin(p.ph * 1.3));
        if (mouse.on) { const dx = p.x - mouse.x, dy = p.y - mouse.y, d = Math.hypot(dx, dy); if (d < 160) { const f = 1 - d / 160; p.x += dx / (d + 1) * f * 34 * dt; p.y += dy / (d + 1) * f * 34 * dt; glow = Math.min(1, glow + f * 0.75); } }
        if (p.y < -20) { p.y = H + 20; p.x = Math.random() * W; }
        if (p.x < -20) p.x = W + 20; else if (p.x > W + 20) p.x = -20;
        ctx.globalAlpha = Math.max(0, glow); const sz = p.r * 2.4;
        ctx.drawImage(p.s, p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); window.removeEventListener("pointermove", onM); };
  }, [density]);
  return <canvas ref={ref} className="embers" style={{ opacity }} aria-hidden />;
}
