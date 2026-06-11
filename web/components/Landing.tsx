"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import MosaicCanvas from "@/components/MosaicCanvas";
import { createDemoWall, type Wall } from "@/lib/demoWall";
import SignInModal from "@/components/SignInModal";
import { signOut } from "@/app/actions";
import Logo from "@/components/Logo";

const fmt = (n: number) => n.toLocaleString("en-US");

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }), { threshold: 0.16 });
    if (ref.current) io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={"reveal " + (shown ? "reveal--in " : "") + className}>{children}</div>;
}

function LiveCounter({ claimed, total }: { claimed: number; total: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let v = 0; const step = Math.max(1, Math.round(claimed / 28));
    const id = setInterval(() => { v = Math.min(claimed, v + step); setN(v); if (v >= claimed) clearInterval(id); }, 28);
    return () => clearInterval(id);
  }, [claimed]);
  const pct = total ? (claimed / total) * 100 : 0;
  return (
    <div className="counter">
      <div className="counter__bar"><div className="counter__fill" style={{ width: pct + "%" }} /></div>
      <div className="counter__row">
        <span className="counter__num">{fmt(n)}</span>
        <span className="counter__den">/ {fmt(total)} tiles claimed · {pct.toFixed(0)}% of the wall is alive</span>
      </div>
    </div>
  );
}

// crop of the demo wall: macro = whole, mid = centred 9×9, micro = centred 2×2
function StaticShot({ wall, kind }: { wall: Wall | null; kind: "macro" | "mid" | "micro" }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv || !wall || !wall.hi) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d"); if (!g) return; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.fillStyle = wall.bg; g.fillRect(0, 0, W, H);
    const t = wall.TILE_PX, s = Math.min(W, H);
    if (kind === "macro") g.drawImage(wall.hi, 0, 0, wall.HI, wall.HI, (W - s) / 2, (H - s) / 2, s, s);
    else { const n = kind === "mid" ? 9 : 2; const st = Math.floor((wall.GRID - n) / 2); g.drawImage(wall.hi, st * t, st * t, n * t, n * t, (W - s) / 2, (H - s) / 2, s, s); }
  }, [wall, kind]);
  return <canvas ref={ref} className="shot__canvas" />;
}

function TileThumb({ wall, idx }: { wall: Wall | null; idx: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv || !wall || !wall.hi) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d"); if (!g) return; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    const t = wall.TILE_PX, x = idx % wall.GRID, y = (idx / wall.GRID) | 0;
    g.fillStyle = wall.bg; g.fillRect(0, 0, W, H); g.drawImage(wall.hi, x * t, y * t, t, t, 0, 0, W, H);
  }, [wall, idx]);
  return <canvas ref={ref} className="tilethumb__canvas" />;
}

const HOW_STEPS = [
  { n: "01", t: "Claim a tile", d: "Open the canvas, tap any open tile, and enter your email. We send you a code; type it back and the tile is yours. No password, no account, just proof it's really you." },
  { n: "02", t: "Paint what's in your mind", d: "A little paint studio opens on your blank tile. Brushes, colours, your hand. A window, a kitchen, a feeling. No curation of style, just your mark." },
  { n: "03", t: "Submit it", d: "Hit submit and your tile goes in for a quick review, then joins the wall with your name beside it and a line about why you made it." },
  { n: "04", t: "Watch it fill", d: "Zoom from the whole wall, hundreds of strangers' tiles at once, down to a single hand. The canvas is never the same twice." },
];

const RULES = [
  { t: "One tile, one person", d: "Each email claims a single tile. Everyone is exactly the same size here." },
  { t: "One small square", d: "Every tile is the same tiny canvas. Constraint is what makes it beautiful together." },
  { t: "Paint your answer", d: "Say what's in your mind. One square of one canvas, in your hand." },
  { t: "It stays", d: "Once it's approved, your tile is part of the canvas, preserved when the wall completes." },
];

export default function Landing({ total, claimed, published, email, myTile }: { total: number; claimed: number; published: number; email: string | null; myTile: { label: string } | null }) {
  const [wall, setWall] = useState<Wall | null>(null);
  const [solid, setSolid] = useState(false);
  const [ver, setVer] = useState(0);
  const [signInOpen, setSignInOpen] = useState(false);
  const open = Math.max(0, total - claimed);

  // smaller per-tile resolution on phones: same look at phone size, a fraction of the memory
  useEffect(() => { setWall(createDemoWall(24, 0.7, window.innerWidth < 700 ? 56 : 96)); setVer((v) => v + 1); }, []);
  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    window.addEventListener("scroll", onScroll); onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // featured: a few claimed demo tiles
  const featured: number[] = [];
  if (wall) { const seen = new Set<number>(); for (let i = 0; i < wall.N_TOTAL && featured.length < 6; i++) { const j = (i * 53 + 17) % wall.N_TOTAL; if (wall.isClaimed(j) && !seen.has(j)) { seen.add(j); featured.push(j); } } }

  return (
    <div className="scroll-root">
      {/* nav */}
      <header className={"nav" + (solid ? " nav--solid" : "")}>
        <div className="nav__brand">
          <Logo />
          <span className="nav__edition">Canvas Nº 001 · open now</span>
        </div>
        <nav className="nav__links">
          <a href="#how">How it works</a>
          <a href="#rules">The rules</a>
          <a href="#wall">The wall</a>
        </nav>
        <div className="nav__right">
          <span className="livepill"><span className="livedot" /><span className="livepill__live">live</span><span className="livepill__count">{fmt(claimed)} / {fmt(total)} claimed</span></span>
          {email ? (
            <>
              <span className="authchip" title={email}>{email}</span>
              <form action={signOut} style={{ display: "inline" }}><button type="submit" className="linkbtn">Sign out</button></form>
              <Link className="btn btn--primary" href={myTile ? "/canvas?mine=1" : "/canvas"}>{myTile ? "Your tile" : "Claim a tile"}</Link>
            </>
          ) : (
            <>
              <button className="linkbtn" onClick={() => setSignInOpen(true)}>Sign in</button>
              <Link className="btn btn--primary" href="/canvas">Open the canvas</Link>
            </>
          )}
        </div>
      </header>

      {/* hero */}
      <section className="hero">
        <div className="hero__canvas">
          {wall && <MosaicCanvas wall={wall} hero version={ver} />}
          <div className="hero__scrim" />
          <div className="hero__grain" />
        </div>
        <div className="hero__inner">
          <div className="hero__eyebrow"><span className="livedot" /> {fmt(open)} tiles still open on this canvas</div>
          <h1 className="hero__title">Leave the words.<br />Draw the lines.<br /><em>Say what&apos;s in your mind.</em></h1>
          <p className="hero__sub">Claim a tile with your email and paint what's in your mind. Something surreal is forming here: one canvas, hundreds of strangers, each holding one small square. Just your email and a few minutes.</p>
          <div className="hero__cta">
            <Link className="btn btn--primary btn--lg" href="/canvas">Claim your tile</Link>
            <a className="btn btn--ghost btn--lg" href="#how">See how it works</a>
          </div>
          <div className="hero__ticker"><LiveCounter claimed={claimed} total={total} /></div>
          <p className="hero__demo">✦ <b>The wall above is a demo preview</b>, a sense of what the canvas becomes. The live wall is just getting started; <Link href="/canvas" style={{ color: "var(--accent)" }}>open the canvas</Link> to claim a real tile.</p>
        </div>
        <a className="hero__scrollhint" href="#how">Scroll<span className="hero__scrollline" /></a>
      </section>

      {/* stats */}
      <section className="band band--stats">
        <Reveal className="statgrid">
          <div className="statbig"><div className="statbig__v">{fmt(claimed)}</div><div className="statbig__l">tiles claimed</div><div className="statbig__s">of {fmt(total)}</div></div>
          <div className="statbig"><div className="statbig__v">{fmt(open)}</div><div className="statbig__l">tiles open</div><div className="statbig__s">claim one now</div></div>
          <div className="statbig"><div className="statbig__v">{fmt(published)}</div><div className="statbig__l">on the wall</div><div className="statbig__s">painted &amp; approved</div></div>
          <div className="statbig"><div className="statbig__v">1</div><div className="statbig__l">tile per person</div><div className="statbig__s">verified by email</div></div>
        </Reveal>
      </section>

      {/* manifesto */}
      <section className="band" id="manifesto">
        <Reveal>
          <p className="bigquote">This isn&apos;t a marketplace. It&apos;s a <em>wall</em>: {fmt(total)} little squares, each one painted by a different person, sitting side by side at exactly the same size.</p>
          <p className="bigquote__by">Claim one, paint what's in your mind, and your mark stays. That&apos;s the whole thing.</p>
        </Reveal>
      </section>

      {/* how */}
      <section className="band" id="how">
        <Reveal><div className="sectionhead"><span className="kicker">How it works</span><h2 className="h2">Four steps, one wall</h2></div></Reveal>
        <div className="steps">
          {HOW_STEPS.map((s) => (
            <Reveal key={s.n} className="step">
              <div className="step__n">{s.n}</div>
              <div><h3 className="step__t">{s.t}</h3><p className="step__d">{s.d}</p></div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* three ways to look */}
      <section className="band" id="wall">
        <Reveal><div className="sectionhead"><span className="kicker">Three ways to look</span><h2 className="h2">From the whole wall<br />to a single hand</h2></div></Reveal>
        <div className="modes">
          {([["macro", "The whole wall", `${fmt(total)} tiles at once: a quilt of strangers, all at the same scale.`], ["mid", "Neighbourhoods", "Pan around and find the little clusters where styles rhyme."], ["micro", "A single hand", "One tile: one person's painting, their name, and a line about it."]] as const).map(([kind, t, d]) => (
            <Reveal key={kind} className="mode">
              <div className="shot"><StaticShot wall={wall} kind={kind} /></div>
              <div className="mode__meta"><span className="mode__t">{t}</span><p className="mode__d">{d}</p></div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* rules */}
      <section className="band" id="rules">
        <Reveal><div className="sectionhead"><span className="kicker">The only rules</span><h2 className="h2">Simple on purpose</h2></div></Reveal>
        <div className="rules">
          {RULES.map((r, i) => (
            <Reveal key={r.t} className="rule">
              <span className="rule__n">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="rule__t">{r.t}</h3>
              <p className="rule__d">{r.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* featured (demo) */}
      <section className="band">
        <Reveal><div className="sectionhead"><span className="kicker">A glimpse of the wall</span><h2 className="h2">What a tile can be</h2></div></Reveal>
        <div className="featured">
          {wall && featured.map((idx) => {
            const o = wall.infoFor(idx);
            return (
              <Reveal key={idx} className="ftile">
                <div className="ftile__art"><TileThumb wall={wall} idx={idx} /></div>
                <div className="ftile__meta"><span className="ftile__h">{o.handle}</span><span className="ftile__id">{o.id}</span></div>
                <p className="ftile__note">“{o.note}”</p>
              </Reveal>
            );
          })}
        </div>
        <p className="hero__demo" style={{ marginTop: 28 }}>Demo tiles, for a sense of it. The live wall is yours to fill.</p>
      </section>

      {/* closer */}
      <section className="band band--close">
        <Reveal>
          <p className="close__big">Your tile is<br /><em>waiting.</em></p>
          <Link className="btn btn--primary btn--lg" href="/canvas">Claim your tile</Link>
          <div className="close__meta">{fmt(open)} of {fmt(total)} tiles still open on Canvas Nº 001</div>
        </Reveal>
      </section>

      {/* footer */}
      <footer className="foot">
        <div className="foot__brand"><Logo /><span className="foot__tag">Leave the words. Draw the lines. Say what&apos;s in your mind.</span></div>
        <div className="foot__cols">
          <div className="foot__col"><span className="foot__h">Canvas</span><Link href="/canvas">The wall</Link><a href="#how">How it works</a><a href="#rules">The rules</a></div>
          <div className="foot__col"><span className="foot__h">About</span><a href="#manifesto">Manifesto</a><a href="#wall">Three ways to look</a><a href="#how">How it works</a></div>
          <div className="foot__col"><span className="foot__h">More</span><a href="/admin">Moderation</a></div>
        </div>
        <div className="foot__legal">© 2026 ekam.ink · many hands, one canvas.</div>
      </footer>
      {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}
    </div>
  );
}
