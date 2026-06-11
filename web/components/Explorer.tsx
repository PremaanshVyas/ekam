"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MosaicCanvas, { type MosaicApi, type Insets } from "@/components/MosaicCanvas";
import Studio from "@/components/Studio";
import { createRealWall, type RealTileInput } from "@/lib/realWall";
import { stitchWall, downloadBlob } from "@/lib/stitch";
import type { Wall, TileInfo } from "@/lib/demoWall";
import { createSupabaseBrowser } from "@/lib/auth-browser";
import { claimTileAt, toggleVote } from "@/app/canvas/actions";
import { submitTile, saveDraft, reviewStatus, requestManualReview, type ReviewState } from "@/app/paint/actions";
import { signOut, markNotificationsRead } from "@/app/actions";
import SignInModal from "@/components/SignInModal";
import ShareTile from "@/components/ShareTile";
import Logo from "@/components/Logo";

type MyTile = { id: string; idx: number; status: string; name: string | null; artUrl: string | null; story: string | null; draftUrl: string | null; draftStory: string | null; aiVerdict: string | null; aiReason: string | null };
type Panel = "detail" | "claim" | "studio" | "reviewing" | null;
type Notif = { id: string; kind: string; title: string; body: string | null; created_at: string; read_at: string | null };
type ViewMode = "claimed" | "all";

// ── crisp tile / neighborhood render ──
function TileArt({ wall, idx, region = 1, version, artUrl, className }: { wall: Wall; idx: number; region?: number; version: number; artUrl?: string | null; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv || !wall.hi) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr; const g = cv.getContext("2d"); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.fillStyle = wall.bg; g.fillRect(0, 0, W, H);
    // single tile → load the FULL-RES source (crisp), not the low-res composite crop
    const url = region === 1 ? (artUrl ?? wall.artUrlFor?.(idx) ?? null) : null;
    if (url) { const im = new Image(); im.onload = () => { g.fillStyle = wall.PAPER; g.fillRect(0, 0, W, H); g.drawImage(im, 0, 0, W, H); }; im.src = url; return; }
    const t = wall.TILE_PX, cx = idx % wall.GRID, cy = (idx / wall.GRID) | 0, half = (region - 1) / 2;
    g.drawImage(wall.hi, (cx - half) * t, (cy - half) * t, region * t, region * t, 0, 0, W, H);
    if (region > 1) { const cell = W / region; g.strokeStyle = wall.accent; g.lineWidth = 2; g.strokeRect(half * cell + 1, half * cell + 1, cell - 2, cell - 2); }
  }, [wall, idx, region, version, artUrl]);
  return <canvas ref={ref} className={className} />;
}

function Tooltip({ hover }: { hover: { info: TileInfo; x: number; y: number } | null }) {
  if (!hover) return null; const { info, x, y } = hover; const flip = x > window.innerWidth - 240;
  return (
    <div className="tip" style={{ left: x + (flip ? -16 : 16), top: y + 16, transform: flip ? "translateX(-100%)" : "none" }}>
      {info.claimed ? (
        <><div className="tip__row"><span className="tip__handle">{info.mine ? "Your tile" : info.handle && info.handle !== "—" ? info.handle : "Claimed"}</span></div><div className="tip__meta">{info.id} · {info.stage ?? (info.handle === "—" ? "being painted" : "on the wall")}</div></>
      ) : (
        <><div className="tip__row"><span className="tip__handle">Open tile</span></div><div className="tip__meta">{info.id}</div><div className="tip__cta">Click to claim →</div></>
      )}
    </div>
  );
}

type Loved = { idx: number; name: string; votes: number; label: string };
function Sidebar({ open, claimed, total, loved, onLoved }: { open: boolean; claimed: number; total: number; loved: Loved[]; onLoved: (idx: number) => void }) {
  const pct = total ? (claimed / total) * 100 : 0;
  return (
    <aside className={"side" + (open ? "" : " side--closed")} aria-hidden={!open}>
      <div className="side__scroll">
        <div className="side__head"><span className="kicker">Canvas Nº 001</span><h2 className="side__theme">what home looks like</h2><p className="side__by">a collaborative canvas</p></div>
        <div className="side__sec">
          <div className="side__label">Completion</div>
          <div className="side__bar"><div className="side__fill" style={{ width: pct + "%" }} /></div>
          <div className="side__nums"><span className="side__big">{pct.toFixed(0)}%</span><span className="side__small">{claimed} / {total} claimed</span></div>
        </div>
        <div className="side__sec">
          <div className="side__label">The wall right now</div>
          <ul className="remain">
            <li className="remain__row"><span className="dotsq dotsq--claimed" /><span className="remain__c">Claimed</span><span className="remain__n">{claimed}</span></li>
            <li className="remain__row"><span className="dotsq dotsq--open" /><span className="remain__c">Open to claim</span><span className="remain__n">{Math.max(0, total - claimed)}</span></li>
          </ul>
        </div>
        {loved.length > 0 && (
          <div className="side__sec">
            <div className="side__label">Most loved</div>
            <ul className="remain">
              {loved.map((l, i) => (
                <li key={l.idx}>
                  <button className="loved__row" onClick={() => onLoved(l.idx)}>
                    <span className="loved__rank">{i === 0 ? "✦" : i + 1}</span>
                    <span className="loved__name">{l.name}</span>
                    <span className="loved__label">{l.label}</span>
                    <span className="loved__count">♥ {l.votes}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="side__sec">
          <div className="side__label">Take part</div>
          <ol className="howmini">
            <li><b>Tap an open tile</b> and verify your email with a code.</li>
            <li><b>Paint what home looks like</b> on your blank tile.</li>
            <li><b>Submit.</b> After a quick review it joins the wall with your name.</li>
          </ol>
        </div>
        <div className="side__foot"><span className="freebadge">1 / 1</span><div className="side__collab"><span className="side__cname">One tile per person</span><span className="side__crole">verified by email, once</span></div></div>
      </div>
    </aside>
  );
}

function Dock({ api, viewMode, setViewMode, zoomLabel }: { api: React.MutableRefObject<MosaicApi | null>; viewMode: ViewMode; setViewMode: (v: ViewMode) => void; zoomLabel: string }) {
  return (
    <div className="dock">
      <div className="dock__group">
        <button className="dock__btn" aria-label="Zoom out" onClick={() => api.current?.zoomOut()}>−</button>
        <div className="dock__zoomlabel">{zoomLabel}</div>
        <button className="dock__btn" aria-label="Zoom in" onClick={() => api.current?.zoomIn()}>+</button>
      </div>
      <div className="dock__divider" />
      <div className="dock__group dock__presets">
        <button className="dock__chip" onClick={() => api.current?.zoomTo("macro")}>Wall</button>
        <button className="dock__chip" onClick={() => api.current?.zoomTo("mid")}>Mid</button>
        <button className="dock__chip" onClick={() => api.current?.zoomTo("micro")}>Tile</button>
      </div>
      <div className="dock__divider" />
      <div className="seg">
        {([["claimed", "The wall"], ["all", "All tiles"]] as const).map(([k, l]) => (
          <button key={k} className={"seg__btn" + (viewMode === k ? " seg__btn--on" : "")} onClick={() => setViewMode(k)}>{l}</button>
        ))}
      </div>
    </div>
  );
}

const OTP_LEN = 8; // ekam's Supabase issues 8 digit email codes
function OTPInput({ onComplete }: { onComplete: (code: string) => void }) {
  const [vals, setVals] = useState<string[]>(() => Array(OTP_LEN).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const fill = (start: number, digits: string) => {
    const next = vals.slice();
    for (let k = 0; k < digits.length && start + k < OTP_LEN; k++) next[start + k] = digits[k];
    setVals(next);
    const last = Math.min(start + digits.length, OTP_LEN - 1); refs.current[last]?.focus();
    if (next.every((c) => c !== "")) onComplete(next.join(""));
  };
  const set = (i: number, raw: string) => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length > 1) { fill(i, digits); return; } // paste support
    const next = vals.slice(); next[i] = digits.slice(-1); setVals(next);
    if (digits && i < OTP_LEN - 1) refs.current[i + 1]?.focus();
    if (next.every((c) => c !== "")) onComplete(next.join(""));
  };
  const key = (i: number, e: React.KeyboardEvent) => { if (e.key === "Backspace" && !vals[i] && i > 0) refs.current[i - 1]?.focus(); };
  return (
    <div className="otp">
      {vals.map((v, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} className="otp__box" inputMode="numeric" aria-label={"Code digit " + (i + 1)}
          value={v} onChange={(e) => set(i, e.target.value)} onKeyDown={(e) => key(i, e)} autoFocus={i === 0} />
      ))}
    </div>
  );
}

function ClaimFlow({ wall, info, version, accent, signedIn, userEmail, hasTile, myLabel, onClose, onClaimed, onZoomMine }: {
  wall: Wall; info: TileInfo; version: number; accent: string; signedIn: boolean; userEmail: string | null; hasTile: boolean; myLabel: string;
  onClose: () => void; onClaimed: (tileId: string) => void; onZoomMine: () => void;
}) {
  const [step, setStep] = useState<"confirm" | "email" | "code">(signedIn ? "confirm" : "email");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [signedOk, setSignedOk] = useState(false);
  const [err, setErr] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const doClaim = async () => {
    setBusy(true); setErr("");
    const res = await claimTileAt(info.idx);
    if (res.ok) { onClaimed(res.tileId); return; }
    setBusy(false);
    if (res.error === "have-tile") setErr("You already have a tile. Edit that one instead.");
    else if (res.error === "taken") setErr("Someone just claimed this tile. Close this and pick another.");
    else setErr("Couldn't claim. Try again.");
  };
  const send = async () => {
    if (!valid) return; setBusy(true); setErr("");
    const { error } = await createSupabaseBrowser().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setBusy(false); if (error) setErr(error.message); else setStep("code");
  };
  const verify = async (code: string) => {
    if (busy) return; setBusy(true); setErr("");
    const { error } = await createSupabaseBrowser().auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (error) { setBusy(false); setErr(error.message); return; }
    setSignedOk(true);
    await doClaim();
  };

  return (
    <div className="panel panel--claim">
      <div className="panel__head">
        <span className="panel__eyebrow"><span className="studio__dot" style={{ background: accent }} />Claim · {info.id}</span>
        <button className="panel__x" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {hasTile ? (
        <>
          <h3 className="claim__t">You already have a tile.</h3>
          <p className="claim__d">One tile per person. Yours is at <b>{myLabel}</b>, head there to paint or edit it.</p>
          <button className="btn btn--primary btn--block" onClick={onZoomMine}>Go to your tile</button>
          <div className="claim__art" style={{ marginTop: 18 }}><TileArt wall={wall} idx={info.idx} region={5} version={version} className="detail__nbcanvas" /></div>
        </>
      ) : step === "confirm" ? (
        <>
          <h3 className="claim__t">This tile is open.</h3>
          <p className="claim__d">Claim {info.id} as <b>{userEmail}</b>. It&apos;s yours to paint.</p>
          {err && <p className="claim__err">{err}</p>}
          <button className={"btn btn--primary btn--block" + (busy ? " btn--loading" : "")} disabled={busy} onClick={doClaim}>{busy ? "Claiming…" : "Claim this tile"}</button>
          <p className="claim__fine">One tile per person.</p>
          <div className="claim__art" style={{ marginTop: 14 }}><TileArt wall={wall} idx={info.idx} region={5} version={version} className="detail__nbcanvas" /></div>
        </>
      ) : step === "email" ? (
        <>
          <h3 className="claim__t">This tile is open.</h3>
          <p className="claim__d">Claim it with your email. We&apos;ll send a code to prove it&apos;s you, no password, no account.</p>
          <div className="co__field"><label>Email</label>
            <input className="co__input co__inputlive" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          </div>
          {err && <p className="claim__err">{err}</p>}
          <button className={"btn btn--primary btn--block" + (busy ? " btn--loading" : "")} disabled={!valid || busy} onClick={send}>{busy ? "Sending code…" : "Send me a code"}</button>
          <p className="claim__fine">We only use your email to verify this one tile.</p>
          <div className="claim__art" style={{ marginTop: 14 }}><TileArt wall={wall} idx={info.idx} region={5} version={version} className="detail__nbcanvas" /></div>
        </>
      ) : (
        <>
          <button className="panel__back" onClick={() => setStep("email")}>‹ Back</button>
          <div className="claim__mail">✉</div>
          <h3 className="claim__t">Check your inbox.</h3>
          <p className="claim__d">We sent a code to <b>{email}</b>. Enter it to claim {info.id}.</p>
          <OTPInput onComplete={verify} />
          {err && <p className="claim__err">{err}</p>}
          <p className="claim__fine">{signedOk ? "Signed in ✓ · claiming your tile…" : busy ? "Verifying…" : "The code submits itself when you finish typing."}</p>
        </>
      )}
    </div>
  );
}

function VoteButton({ uuid, votes, voted, signedIn, onNeedSignIn }: { uuid: string; votes: number; voted: boolean; signedIn: boolean; onNeedSignIn: () => void }) {
  const [v, setV] = useState(voted);
  const [n, setN] = useState(votes);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setV(voted); setN(votes); }, [uuid, voted, votes]);
  const click = async () => {
    if (!signedIn) { onNeedSignIn(); return; }
    if (busy) return; setBusy(true);
    const next = !v; setV(next); setN((c) => Math.max(0, c + (next ? 1 : -1))); // optimistic
    const r = await toggleVote(uuid);
    setBusy(false);
    if (!r.ok) { setV(!next); setN((c) => Math.max(0, c + (next ? -1 : 1))); if (r.error === "auth") onNeedSignIn(); }
    else { setV(!!r.voted); setN(r.count ?? 0); }
  };
  return (
    <button className={"votebtn" + (v ? " votebtn--on" : "")} onClick={click} disabled={busy} aria-pressed={v}>
      <span className="votebtn__h" aria-hidden>♥</span> {v ? "Loved" : "Love this tile"}{n > 0 ? ` · ${n}` : ""}
    </button>
  );
}

function TileDetail({ wall, info, version, myTile, signedIn, onNeedSignIn, onClose, onZoom, onEdit }: {
  wall: Wall; info: TileInfo; version: number; myTile: MyTile | null; signedIn: boolean; onNeedSignIn: () => void;
  onClose: () => void; onZoom: () => void; onEdit: () => void;
}) {
  const mineArt = info.mine ? (myTile?.draftUrl ?? myTile?.artUrl ?? null) : null; // show latest autosaved draft, not the older submitted image
  const published = info.handle && info.handle !== "—" && info.handle !== "you";
  return (
    <div className="panel panel--detail">
      <div className="panel__head">
        <span className="panel__eyebrow"><span className="studio__dot" style={{ background: wall.accent }} />{info.mine ? "Your tile" : "A tile"}</span>
        <button className="panel__x" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="detail__art"><TileArt wall={wall} idx={info.idx} version={version} artUrl={mineArt} className="detail__canvas" /></div>
      <div className="detail__id">{info.id}<span className="detail__num">№ {info.num} of {wall.N_TOTAL}</span></div>
      {/* primary action first — never below the scroll fold */}
      {info.mine
        ? <button className="btn btn--primary btn--block" style={{ marginTop: 0 }} onClick={onEdit}>{myTile?.status === "claimed" ? "Paint your tile" : "Edit your tile"}</button>
        : <button className="btn btn--ghost btn--block" style={{ marginTop: 0 }} onClick={onZoom}>Zoom to this tile</button>}
      {!info.mine && info.uuid && <VoteButton uuid={info.uuid} votes={info.votes ?? 0} voted={!!info.voted} signedIn={signedIn} onNeedSignIn={onNeedSignIn} />}
      {info.mine && (info.votes ?? 0) > 0 && <p className="vote__mine">♥ {info.votes} {info.votes === 1 ? "person loves" : "people love"} your tile</p>}
      {info.mine && myTile?.status === "published" && myTile.artUrl && (
        <ShareTile url={`https://ekam.ink/t/${myTile.id}`} imageUrl={myTile.artUrl} title="my tile on ekam.ink · what home looks like" />
      )}
      {info.mine && myTile?.status === "pending" && <p className="detail__sharehint">In review. You can share it once it&apos;s live on the wall.</p>}
      {info.mine && myTile?.status !== "pending" && myTile?.aiVerdict === "reject" && (
        <p className="detail__sharehint" style={{ color: "var(--accent)" }}>
          {myTile.status === "published" ? "Your last update was returned" : "Returned by review"}{myTile.aiReason ? `: ${myTile.aiReason}` : "."} Edit your tile and resubmit.
        </p>
      )}
      <div className="owner">
        <div className="owner__avatar" style={{ background: wall.accent }}>{(info.handle || "?").slice(0, 1).toUpperCase()}</div>
        <div className="owner__meta">
          <span className="owner__handle">{info.mine ? "you" : info.handle || "someone"}</span>
          <span className="owner__joined">{info.mine ? (myTile?.status === "published" ? "on the wall" : myTile?.status === "pending" ? "in review" : myTile?.aiVerdict === "reject" && myTile?.artUrl ? "returned · needs a change" : myTile?.artUrl ? "ready to resubmit" : "claimed · not painted yet") : published ? "on the wall" : "being painted"}</span>
        </div>
      </div>
      {info.note && <blockquote className="owner__note">“{info.note}”</blockquote>}
      {info.mine && myTile?.story && !info.note && <blockquote className="owner__note">“{myTile.story}”</blockquote>}
      <div className="detail__nb">
        <div className="side__label">Neighbourhood</div>
        <TileArt wall={wall} idx={info.idx} region={5} version={version} className="detail__nbcanvas" />
        <p className="detail__nbhint">Every painted tile here was made by a different person.</p>
      </div>
    </div>
  );
}

const CONFETTI_N = 18;
const fmtDay = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "");

export default function Explorer({ cols, total, tiles, claimed, email, myTile, autoOpenMine, loadError, notifs = [], unread = 0, complete = false, finalePreview = false, published = 0, finaleFrom = null, finaleTo = null }: {
  cols: number; total: number; tiles: RealTileInput[]; claimed: number; email: string | null; myTile: MyTile | null; autoOpenMine?: boolean; loadError?: boolean; notifs?: Notif[]; unread?: number;
  complete?: boolean; finalePreview?: boolean; published?: number; finaleFrom?: string | null; finaleTo?: string | null;
}) {
  const router = useRouter();
  const api = useRef<MosaicApi | null>(null);
  const [wall, setWall] = useState<Wall | null>(null);
  const [ver, setVer] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("claimed");
  const [hover, setHover] = useState<{ info: TileInfo; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<TileInfo | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [desktop, setDesktop] = useState(true);
  const [coarse, setCoarse] = useState(false);
  const [vh, setVh] = useState(800);
  const [sideOpen, setSideOpen] = useState(true);
  const [zoomLabel, setZoomLabel] = useState("Wall");
  const [review, setReview] = useState<ReviewState>({ state: "checking", reason: null });
  const [notifOpen, setNotifOpen] = useState(false);
  const [reqBusy, setReqBusy] = useState(false);
  const studioTarget = useRef<{ tileId: string; idx: number; label: string; artUrl: string | null; note: string; name: string } | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [lastArt, setLastArt] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  const openedMine = useRef(false);
  const [finaleMode, setFinaleMode] = useState<"art" | "tiles">("art");
  const [celebrate, setCelebrate] = useState(false);
  const [stitching, setStitching] = useState(0); // 0 idle, else percent
  const [shared, setShared] = useState(false);

  const myIdx = myTile?.idx ?? -1;
  const accent = "#e8643c";

  const myArt = myTile && myTile.status !== "published" ? (myTile.artUrl ?? myTile.draftUrl) : null;
  // most loved tiles (published, at least one vote), for the crown + the sidebar list
  const loved = tiles
    .filter((t) => t.status === "published" && (t.votes ?? 0) > 0)
    .sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0))
    .slice(0, 3)
    .map((t) => ({ idx: t.y * cols + t.x, name: t.name ?? "someone", votes: t.votes ?? 0, label: "R" + String(t.y + 1).padStart(2, "0") + "·C" + String(t.x + 1).padStart(2, "0") }));
  const topIdx = loved.length ? loved[0].idx : -1;
  useEffect(() => {
    const w = createRealWall(cols, tiles, myIdx, () => setVer((v) => v + 1), myArt, topIdx);
    setWall(w); setVer((v) => v + 1);
  }, [cols, tiles, myIdx, myArt, topIdx]);

  // live wall: server actions broadcast on the "wall" channel whenever a tile changes;
  // refresh (debounced) so new paintings + counters land without anyone touching reload
  useEffect(() => {
    const supa = createSupabaseBrowser();
    let t: number | null = null;
    const refresh = () => { if (t) return; t = window.setTimeout(() => { t = null; router.refresh(); }, 800); };
    const ch = supa.channel("wall").on("broadcast", { event: "tiles" }, refresh).subscribe();
    const vis = () => { if (!document.hidden) router.refresh(); };
    document.addEventListener("visibilitychange", vis);
    return () => { supa.removeChannel(ch); document.removeEventListener("visibilitychange", vis); if (t) window.clearTimeout(t); };
  }, [router]);

  // viewport class + pointer type; sidebar starts closed on small screens
  useEffect(() => {
    const measure = () => { setDesktop(window.innerWidth >= 900); setVh(window.innerHeight); };
    measure();
    setCoarse(window.matchMedia("(pointer: coarse)").matches);
    if (window.innerWidth < 900) setSideOpen(false);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // while the explorer is up, kill pull-to-refresh / overscroll glow so panning never fights the browser
  useEffect(() => {
    const prev = document.documentElement.style.overscrollBehavior;
    document.documentElement.style.overscrollBehavior = "none";
    return () => { document.documentElement.style.overscrollBehavior = prev; };
  }, []);

  // fixed-position roots are their own stacking contexts, so z-index can't layer the
  // global music player under panels — hide its UI (audio keeps playing) while one is open
  useEffect(() => {
    if (panel || celebrate || (complete && finaleMode === "art")) document.body.setAttribute("data-panel", "1");
    else document.body.removeAttribute("data-panel");
    return () => document.body.removeAttribute("data-panel");
  }, [panel, celebrate, complete, finaleMode]);

  useEffect(() => { const id = setInterval(() => { if (api.current) setZoomLabel(api.current.getZoomLabel()); }, 250); return () => clearInterval(id); }, []);

  // first visit, no tile yet → one gentle pointer at the core action
  useEffect(() => {
    try { if (!myTile && !localStorage.getItem("ekam.nudged")) setNudge(true); } catch { /* private mode */ }
  }, [myTile]);
  const dismissNudge = useCallback(() => { setNudge(false); try { localStorage.setItem("ekam.nudged", "1"); } catch { /* fine */ } }, []);

  const onHover = useCallback((info: TileInfo | null, x?: number, y?: number) => setHover(info ? { info, x: x ?? 0, y: y ?? 0 } : null), []);
  const onSelect = useCallback((info: TileInfo) => { setSelected(info); setHover(null); setPanel(info.claimed ? "detail" : "claim"); dismissNudge(); }, [dismissNudge]);
  const closeAll = () => { setPanel(null); setSelected(null); };

  const myLabel = myTile ? "R" + String((Math.floor(myTile.idx / cols)) + 1).padStart(2, "0") + "·C" + String((myTile.idx % cols) + 1).padStart(2, "0") : "";
  const openMine = useCallback(() => {
    if (!myTile || !wall) return;
    setSelected(wall.infoFor(myTile.idx)); setPanel("detail"); setHover(null);
    setTimeout(() => api.current?.zoomToTile(myTile.idx, 96), 60); // after the insets recenter kicks in
  }, [myTile, wall]);
  useEffect(() => {
    if (!autoOpenMine || !myTile || !wall || openedMine.current) return;
    openedMine.current = true; const mi = myTile.idx;
    setSelected(wall.infoFor(mi)); setPanel("detail");
    setTimeout(() => api.current?.zoomToTile(mi, 96), 90);
  }, [autoOpenMine, myTile, wall]);

  const openStudioForClaim = (tileId: string) => { if (!selected) return; studioTarget.current = { tileId, idx: selected.idx, label: selected.id, artUrl: null, note: "", name: "" }; setPanel("studio"); };
  // Resume from the latest autosaved draft if there is one; else the submitted/published image.
  const openStudioForEdit = () => { if (!myTile || !wall) return; const label = wall.infoFor(myTile.idx).id; const def = email ? email.split("@")[0] : ""; studioTarget.current = { tileId: myTile.id, idx: myTile.idx, label, artUrl: myTile.draftUrl ?? myTile.artUrl, note: myTile.draftStory ?? myTile.story ?? "", name: myTile.name && myTile.name !== def ? myTile.name : "" }; setPanel("studio"); };
  const onStudioSubmit = async (dataUrl: string, thumbUrl: string | null, name: string, note: string) => {
    const t = studioTarget.current; if (!t) return;
    await submitTile(t.tileId, dataUrl, thumbUrl, name, note);
    setLastArt(dataUrl); setReview({ state: "checking", reason: null }); setPanel("reviewing"); router.refresh();
  };
  // watch the AI review land in real time after a submit
  useEffect(() => {
    if (panel !== "reviewing" || review.state !== "checking") return;
    const started = Date.now(); let stop = false; let timer = 0;
    const tick = async () => {
      if (stop) return;
      const t = studioTarget.current; if (!t) return;
      try {
        const r = await reviewStatus(t.tileId);
        if (stop) return;
        if (r.state !== "checking") { setReview(r); router.refresh(); return; }
      } catch { /* transient; keep polling */ }
      if (Date.now() - started > 75000) { setReview({ state: "escalated", reason: null }); router.refresh(); return; }
      timer = window.setTimeout(tick, 2500);
    };
    timer = window.setTimeout(tick, 1800);
    return () => { stop = true; window.clearTimeout(timer); };
  }, [panel, review.state, router]);
  const askHuman = async () => {
    const t = studioTarget.current; if (!t || reqBusy) return;
    setReqBusy(true);
    const r = await requestManualReview(t.tileId);
    setReqBusy(false);
    if (r.ok) setReview((v) => ({ state: "requested", reason: v.reason }));
  };
  const redrawReturned = () => {
    const t = studioTarget.current; if (!t) return;
    studioTarget.current = { ...t, artUrl: lastArt ?? t.artUrl };
    setPanel("studio");
  };
  const onSaveDraft = async (dataUrl: string, note: string) => { const t = studioTarget.current; if (!t) return { ok: false }; return await saveDraft(t.tileId, dataUrl, note); };

  // the finale: one full picture, seen once with a celebration, then a quiet toggle
  const artMode = complete && finaleMode === "art";
  useEffect(() => {
    if (!complete) return;
    try { if (finalePreview || !localStorage.getItem("ekam.finale.seen")) setCelebrate(true); } catch { setCelebrate(true); }
  }, [complete, finalePreview]);
  const dismissCelebrate = useCallback(() => {
    setCelebrate(false); setFinaleMode("art"); setPanel(null); setSelected(null); setHover(null);
    if (!finalePreview) { try { localStorage.setItem("ekam.finale.seen", "1"); } catch { /* private mode */ } }
    setTimeout(() => api.current?.fit(), 90);
  }, [finalePreview]);
  const switchFinale = useCallback((m: "art" | "tiles") => {
    setFinaleMode(m); setPanel(null); setSelected(null); setHover(null);
    setTimeout(() => api.current?.fit(), 90);
  }, []);
  const downloadArtwork = async () => {
    if (stitching) return; setStitching(1);
    try {
      const st = tiles.filter((t) => t.status === "published" && t.img).map((t) => ({ x: t.x, y: t.y, img: t.img }));
      const blob = await stitchWall(st, cols, Math.round(total / cols), 384, (d, n) => setStitching(Math.max(1, Math.round((d / n) * 100))));
      downloadBlob(blob, "ekam-what-home-looks-like.png");
    } catch { /* button resets below */ }
    setStitching(0);
  };
  const shareArtwork = async () => {
    const url = window.location.origin + "/canvas";
    const text = `what home looks like · one canvas painted by ${published} people · ekam.ink`;
    if (navigator.share) { try { await navigator.share({ title: "ekam.ink", text, url }); } catch { /* cancelled */ } return; }
    try { await navigator.clipboard.writeText(url); setShared(true); setTimeout(() => setShared(false), 1800); } catch { /* fine */ }
  };

  // chrome-aware fit: the wall centers inside the space the topbar/sidebar/panel/dock leave free
  const panelOpen = panel !== null && panel !== "studio";
  const insets: Insets = artMode ? {
    top: 64, left: 14, right: 14, bottom: desktop ? 178 : 206,
  } : {
    top: 64,
    left: desktop && sideOpen ? 348 : 14,
    right: desktop && panelOpen ? 390 : 14,
    bottom: !desktop && panelOpen ? Math.max(120, Math.round(vh * 0.52)) : 104,
  };

  if (!wall) return (
    <div className="explorer ex__loading">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/ekam-mark.svg" width={46} height={46} alt="" className="ex__loadmark" />
      <span>loading the wall…</span>
    </div>
  );

  return (
    <div className="explorer">
      <div className="ex__canvas">
        <MosaicCanvas wall={wall} interactive grid seamless={artMode} viewMode={artMode ? "claimed" : viewMode} version={ver} accent={accent}
          apiRef={api} onHover={artMode ? undefined : onHover} onSelect={artMode ? undefined : onSelect} insets={insets}
          selectedIdx={selected ? selected.idx : -1} hoverIdx={hover ? hover.info.idx : -1} initialZoom="macro" />
        <div className="ex__grain" />
      </div>

      <div className="ex__topbar">
        <Logo sm />
        <div className="ex__topright">
          <span className="ex__edition"><span className="ex__edno">Canvas Nº 001 · </span><span className="ex__live"><span className="livedot" />live</span></span>
          {email ? (
            <>
              <button className="bell" aria-label="Notifications" aria-expanded={notifOpen} onClick={() => { setNotifOpen((o) => !o); if (!notifOpen && unread > 0) markNotificationsRead(); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
                {unread > 0 && <span className="bell__dot" />}
              </button>
              <span className="authchip" title={email}>{email}</span>
              {myTile && <button className="linkbtn" onClick={openMine}>Your tile</button>}
              <form action={signOut} style={{ display: "inline" }}><button type="submit" className="linkbtn">Sign out</button></form>
            </>
          ) : (
            <button className="linkbtn" onClick={() => setSignInOpen(true)}>Sign in</button>
          )}
        </div>
      </div>

      {notifOpen && (
        <>
          <div className="notif__scrim" onClick={() => setNotifOpen(false)} />
          <div className="notif" role="dialog" aria-label="Notifications">
            <div className="notif__head">Notifications</div>
            {notifs.length === 0
              ? <p className="notif__empty">Nothing yet. Claim a tile and it&apos;ll show up here.</p>
              : notifs.map((n) => (
                <div key={n.id} className={"notif__row" + (!n.read_at ? " notif__row--new" : "")}>
                  <span className="notif__t">{n.title}</span>
                  {n.body && <span className="notif__b">{n.body}</span>}
                  <span className="notif__time">{n.created_at.slice(5, 16).replace("T", " · ")}</span>
                </div>
              ))}
          </div>
        </>
      )}

      {loadError && (
        <button className="ex__retry" onClick={() => router.refresh()}>
          Some tiles didn&apos;t load. <b>Tap to retry</b>
        </button>
      )}

      {!artMode && !desktop && sideOpen && <div className="side__backdrop" onClick={() => setSideOpen(false)} />}
      {!artMode && <Sidebar open={sideOpen} claimed={claimed} total={total} loved={loved} onLoved={(idx) => { if (!wall) return; setSelected(wall.infoFor(idx)); setPanel("detail"); setHover(null); if (!desktop) setSideOpen(false); setTimeout(() => api.current?.zoomToTile(idx, 96), 60); }} />}
      {!artMode && <button
        className={"side-fab" + (sideOpen ? " side-fab--open" : "")}
        aria-label={sideOpen ? "Hide canvas info" : "Show canvas info"}
        aria-expanded={sideOpen}
        onClick={() => setSideOpen(!sideOpen)}
      >{sideOpen ? "‹" : "›"}</button>}

      <Tooltip hover={hover} />
      {!artMode && !(panelOpen && !desktop) && <Dock api={api} viewMode={viewMode} setViewMode={setViewMode} zoomLabel={zoomLabel} />}

      {panel && panel !== "studio" && selected && (
        <div className="panelwrap">
          <div className="panel__grab" aria-hidden />
          {panel === "detail" && <TileDetail wall={wall} info={selected} version={ver} myTile={myTile} signedIn={!!email} onNeedSignIn={() => setSignInOpen(true)} onClose={closeAll} onZoom={() => api.current?.zoomToTile(selected.idx, 96)} onEdit={openStudioForEdit} />}
          {panel === "claim" && <ClaimFlow wall={wall} info={selected} version={ver} accent={accent} signedIn={!!email} userEmail={email} hasTile={!!myTile} myLabel={myLabel} onClose={closeAll} onClaimed={openStudioForClaim} onZoomMine={openMine} />}
          {panel === "reviewing" && (
            <div className="panel panel--done">
              {review.state === "live" && <div className="confetti" aria-hidden>{Array.from({ length: CONFETTI_N }).map((_, i) => <i key={i} />)}</div>}
              <div className="panel__head">
                <span className="panel__eyebrow"><span className="studio__dot" style={{ background: accent }} />
                  {review.state === "checking" ? "Reviewing" : review.state === "live" ? "Live" : review.state === "returned" ? "Returned" : review.state === "requested" ? "With the moderator" : "In review"}
                </span>
                <button className="panel__x" onClick={() => { closeAll(); }} aria-label="Close">✕</button>
              </div>
              <div className="done" style={{ paddingTop: 18 }}>
                {review.state === "checking" && (<>
                  <div className="review__spin" aria-hidden />
                  <h3 className="done__t">Reviewing your tile…</h3>
                  <p className="done__d">Our reviewer is taking a look right now. This usually takes under half a minute.</p>
                </>)}
                {review.state === "live" && (<>
                  <div className="done__check done__check--pop">✓</div>
                  <h3 className="done__t">It&apos;s live!</h3>
                  <p className="done__d">Your tile cleared review and just joined the wall with your name. Share it from your tile panel.</p>
                  {lastArt && <button className="btn btn--ghost btn--block" style={{ marginBottom: 10 }} onClick={() => { const a = document.createElement("a"); a.href = lastArt; a.download = "my-tile-ekam.png"; document.body.appendChild(a); a.click(); a.remove(); }}>Download your tile</button>}
                  <button className="btn btn--primary btn--block" onClick={() => { closeAll(); router.refresh(); }}>Back to the wall</button>
                </>)}
                {review.state === "returned" && (<>
                  <div className="done__warn">!</div>
                  <h3 className="done__t">Returned by review.</h3>
                  <p className="done__d">{review.reason ?? "It didn&apos;t pass the wall&apos;s content review."}</p>
                  <button className="btn btn--primary btn--block" onClick={redrawReturned}>Draw something new</button>
                  <button className={"btn btn--ghost btn--block" + (reqBusy ? " btn--loading" : "")} disabled={reqBusy} onClick={askHuman}>{reqBusy ? "Sending…" : "Request a human review"}</button>
                  <p className="claim__fine">The tile stays yours either way.</p>
                </>)}
                {review.state === "requested" && (<>
                  <div className="done__check done__check--pop">✓</div>
                  <h3 className="done__t">With the moderator.</h3>
                  <p className="done__d">A human will review your tile and you&apos;ll get the decision in your notifications here.</p>
                  <button className="btn btn--primary btn--block" onClick={() => { closeAll(); router.refresh(); }}>Back to the wall</button>
                </>)}
                {review.state === "escalated" && (<>
                  <div className="done__check done__check--pop" style={{ background: "transparent", border: "2px solid var(--accent)", color: "var(--accent)" }}>👁</div>
                  <h3 className="done__t">Needs a human look.</h3>
                  <p className="done__d">{review.reason ? review.reason + " " : ""}The moderator will review it shortly and you&apos;ll get the decision in your notifications.</p>
                  <button className="btn btn--ghost btn--block" onClick={redrawReturned}>Edit and resubmit</button>
                  <button className="btn btn--primary btn--block" onClick={() => { closeAll(); router.refresh(); }}>Back to the wall</button>
                </>)}
              </div>
            </div>
          )}
        </div>
      )}

      {panel === "studio" && studioTarget.current && (
        <Studio tileLabel={studioTarget.current.label} initialArtUrl={studioTarget.current.artUrl} initialNote={studioTarget.current.note} initialName={studioTarget.current.name} accent={accent} onClose={() => setPanel(myTile ? "detail" : null)} onSubmit={onStudioSubmit} onSaveDraft={onSaveDraft} />
      )}

      {nudge && !panel && !complete && (
        <button className="ex__nudge" onClick={dismissNudge}>✦ {coarse ? "Tap" : "Click"} any open tile to make it yours</button>
      )}
      {!artMode && <div className="ex__hint">{coarse ? "Pinch to zoom · drag to pan · tap a tile" : "Scroll to zoom · drag to pan · click a tile"}</div>}
      {complete && (
        <div className="fseg" role="tablist" aria-label="Canvas view">
          <button role="tab" aria-selected={finaleMode === "art"} className={"fseg__b" + (finaleMode === "art" ? " fseg__b--on" : "")} onClick={() => switchFinale("art")}>The artwork</button>
          <button role="tab" aria-selected={finaleMode === "tiles"} className={"fseg__b" + (finaleMode === "tiles" ? " fseg__b--on" : "")} onClick={() => switchFinale("tiles")}>The tiles</button>
        </div>
      )}

      {artMode && (
        <div className="fcap">
          <div className="fcap__title">what home looks like</div>
          <div className="fcap__meta">
            Made by {published} {published === 1 ? "person" : "people"}{finaleFrom && finaleTo ? (fmtDay(finaleFrom) === fmtDay(finaleTo) ? `, ${fmtDay(finaleTo)}` : `, ${fmtDay(finaleFrom)} to ${fmtDay(finaleTo)}`) : ""}
          </div>
          <div className="fcap__actions">
            <button className="btn btn--primary" disabled={stitching > 0} onClick={downloadArtwork}>{stitching > 0 ? `Stitching… ${stitching}%` : "Download"}</button>
            <button className="btn btn--ghost" onClick={shareArtwork}>{shared ? "Link copied ✓" : "Share"}</button>
          </div>
        </div>
      )}

      {celebrate && (
        <div className="finale" role="dialog" aria-label="The wall is complete">
          <div className="confetti confetti--sky" aria-hidden>{Array.from({ length: CONFETTI_N }).map((_, i) => <i key={i} />)}</div>
          <div className="finale__card">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/ekam-mark.svg" width={52} height={52} alt="" />
            <h2 className="finale__t">The wall is complete.</h2>
            <p className="finale__d">{published} strangers each painted one tile. Together they made one picture of home.</p>
            <button className="btn btn--primary" onClick={dismissCelebrate}>See the artwork</button>
          </div>
        </div>
      )}

      {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}
    </div>
  );
}
