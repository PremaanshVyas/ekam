"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MosaicCanvas, { type MosaicApi, type Insets } from "@/components/MosaicCanvas";
import Studio from "@/components/Studio";
import { createRealWall, type RealTileInput } from "@/lib/realWall";
import type { Wall, TileInfo } from "@/lib/demoWall";
import { createSupabaseBrowser } from "@/lib/auth-browser";
import { claimTileAt } from "@/app/canvas/actions";
import { submitTile, saveDraft, type SubmitMode } from "@/app/paint/actions";
import { signOut } from "@/app/actions";
import SignInModal from "@/components/SignInModal";
import ShareTile from "@/components/ShareTile";
import Logo from "@/components/Logo";

type MyTile = { id: string; idx: number; status: string; name: string | null; artUrl: string | null; story: string | null; draftUrl: string | null; draftStory: string | null };
type Panel = "detail" | "claim" | "studio" | "submitted" | null;
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
        <><div className="tip__row"><span className="tip__handle">{info.mine ? "Your tile" : info.handle && info.handle !== "—" ? info.handle : "Claimed"}</span></div><div className="tip__meta">{info.id} · {info.handle === "—" ? "being painted" : "on the wall"}</div></>
      ) : (
        <><div className="tip__row"><span className="tip__handle">Open tile</span></div><div className="tip__meta">{info.id}</div><div className="tip__cta">Click to claim →</div></>
      )}
    </div>
  );
}

function Sidebar({ open, claimed, total }: { open: boolean; claimed: number; total: number }) {
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

function TileDetail({ wall, info, version, myTile, onClose, onZoom, onEdit }: {
  wall: Wall; info: TileInfo; version: number; myTile: MyTile | null;
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
      {info.mine && myTile?.status === "published" && myTile.artUrl && (
        <ShareTile url={`https://ekam.ink/t/${myTile.id}`} imageUrl={myTile.artUrl} title="my tile on ekam.ink · what home looks like" />
      )}
      {info.mine && myTile?.status === "pending" && <p className="detail__sharehint">In review. You can share it once it&apos;s live on the wall.</p>}
      <div className="owner">
        <div className="owner__avatar" style={{ background: wall.accent }}>{(info.handle || "?").slice(0, 1).toUpperCase()}</div>
        <div className="owner__meta">
          <span className="owner__handle">{info.mine ? "you" : info.handle || "someone"}</span>
          <span className="owner__joined">{info.mine ? (myTile?.status === "published" ? "on the wall" : myTile?.status === "pending" ? "in review" : "claimed · not painted yet") : published ? "on the wall" : "being painted"}</span>
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

const SUBMIT_COPY: Record<SubmitMode, { t: string; d: string }> = {
  "new": { t: "It’s in the queue!", d: "Your tile is off for a quick review. Once approved it joins the wall with your name, and you can share it everywhere." },
  "edit-pending": { t: "Updated.", d: "Your new version replaced the old one in the moderation queue. It joins the wall as soon as it’s approved." },
  "edit-published": { t: "Update received.", d: "Your live tile stays on the wall while the new version waits for review. We swap them the moment it’s approved." },
};
const CONFETTI_N = 18;

export default function Explorer({ cols, total, tiles, claimed, email, myTile, autoOpenMine, loadError }: {
  cols: number; total: number; tiles: RealTileInput[]; claimed: number; email: string | null; myTile: MyTile | null; autoOpenMine?: boolean; loadError?: boolean;
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
  const [submitMode, setSubmitMode] = useState<SubmitMode>("new");
  const studioTarget = useRef<{ tileId: string; idx: number; label: string; artUrl: string | null; note: string; name: string } | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const [lastArt, setLastArt] = useState<string | null>(null);
  const openedMine = useRef(false);

  const myIdx = myTile?.idx ?? -1;
  const accent = "#e8643c";

  useEffect(() => {
    const w = createRealWall(cols, tiles, myIdx, () => setVer((v) => v + 1));
    setWall(w); setVer((v) => v + 1);
  }, [cols, tiles, myIdx]);

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

  useEffect(() => { const id = setInterval(() => { if (api.current) setZoomLabel(api.current.getZoomLabel()); }, 250); return () => clearInterval(id); }, []);

  const onHover = useCallback((info: TileInfo | null, x?: number, y?: number) => setHover(info ? { info, x: x ?? 0, y: y ?? 0 } : null), []);
  const onSelect = useCallback((info: TileInfo) => { setSelected(info); setHover(null); setPanel(info.claimed ? "detail" : "claim"); }, []);
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
    const res = await submitTile(t.tileId, dataUrl, thumbUrl, name, note);
    setSubmitMode(res.mode); setLastArt(dataUrl); setPanel("submitted"); router.refresh();
  };
  const onSaveDraft = async (dataUrl: string, note: string) => { const t = studioTarget.current; if (!t) return { ok: false }; return await saveDraft(t.tileId, dataUrl, note); };

  // chrome-aware fit: the wall centers inside the space the topbar/sidebar/panel/dock leave free
  const panelOpen = panel !== null && panel !== "studio";
  const insets: Insets = {
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

  const submitCopy = SUBMIT_COPY[submitMode];

  return (
    <div className="explorer">
      <div className="ex__canvas">
        <MosaicCanvas wall={wall} interactive grid viewMode={viewMode} version={ver} accent={accent}
          apiRef={api} onHover={onHover} onSelect={onSelect} insets={insets}
          selectedIdx={selected ? selected.idx : -1} hoverIdx={hover ? hover.info.idx : -1} initialZoom="macro" />
        <div className="ex__grain" />
      </div>

      <div className="ex__topbar">
        <Logo sm />
        <div className="ex__topright">
          <span className="ex__edition"><span className="ex__edno">Canvas Nº 001 · </span><span className="ex__live"><span className="livedot" />live</span></span>
          {email ? (
            <>
              <span className="authchip" title={email}>{email}</span>
              {myTile && <button className="linkbtn" onClick={openMine}>Your tile</button>}
              <form action={signOut} style={{ display: "inline" }}><button type="submit" className="linkbtn">Sign out</button></form>
            </>
          ) : (
            <button className="linkbtn" onClick={() => setSignInOpen(true)}>Sign in</button>
          )}
        </div>
      </div>

      {loadError && (
        <button className="ex__retry" onClick={() => router.refresh()}>
          Some tiles didn&apos;t load. <b>Tap to retry</b>
        </button>
      )}

      {!desktop && sideOpen && <div className="side__backdrop" onClick={() => setSideOpen(false)} />}
      <Sidebar open={sideOpen} claimed={claimed} total={total} />
      <button
        className={"side-fab" + (sideOpen ? " side-fab--open" : "")}
        aria-label={sideOpen ? "Hide canvas info" : "Show canvas info"}
        aria-expanded={sideOpen}
        onClick={() => setSideOpen(!sideOpen)}
      >{sideOpen ? "‹" : "›"}</button>

      <Tooltip hover={hover} />
      {!(panelOpen && !desktop) && <Dock api={api} viewMode={viewMode} setViewMode={setViewMode} zoomLabel={zoomLabel} />}

      {panel && panel !== "studio" && selected && (
        <div className="panelwrap">
          <div className="panel__grab" aria-hidden />
          {panel === "detail" && <TileDetail wall={wall} info={selected} version={ver} myTile={myTile} onClose={closeAll} onZoom={() => api.current?.zoomToTile(selected.idx, 96)} onEdit={openStudioForEdit} />}
          {panel === "claim" && <ClaimFlow wall={wall} info={selected} version={ver} accent={accent} signedIn={!!email} userEmail={email} hasTile={!!myTile} myLabel={myLabel} onClose={closeAll} onClaimed={openStudioForClaim} onZoomMine={openMine} />}
          {panel === "submitted" && (
            <div className="panel panel--done">
              <div className="confetti" aria-hidden>{Array.from({ length: CONFETTI_N }).map((_, i) => <i key={i} />)}</div>
              <div className="panel__head"><span className="panel__eyebrow"><span className="studio__dot" style={{ background: accent }} />Submitted</span><button className="panel__x" onClick={() => { closeAll(); }} aria-label="Close">✕</button></div>
              <div className="done" style={{ paddingTop: 18 }}>
                <div className="done__check done__check--pop">✓</div>
                <h3 className="done__t">{submitCopy.t}</h3>
                <p className="done__d">{submitCopy.d}</p>
                {lastArt && <button className="btn btn--ghost btn--block" style={{ marginBottom: 10 }} onClick={() => { const a = document.createElement("a"); a.href = lastArt; a.download = "my-tile-ekam.png"; document.body.appendChild(a); a.click(); a.remove(); }}>Download your tile</button>}
                <button className="btn btn--primary btn--block" onClick={() => { closeAll(); router.refresh(); }}>Back to the wall</button>
              </div>
            </div>
          )}
        </div>
      )}

      {panel === "studio" && studioTarget.current && (
        <Studio tileLabel={studioTarget.current.label} initialArtUrl={studioTarget.current.artUrl} initialNote={studioTarget.current.note} initialName={studioTarget.current.name} accent={accent} onClose={() => setPanel(myTile ? "detail" : null)} onSubmit={onStudioSubmit} onSaveDraft={onSaveDraft} />
      )}

      <div className="ex__hint">{coarse ? "Pinch to zoom · drag to pan · tap a tile" : "Scroll to zoom · drag to pan · click a tile"}</div>
      {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}
    </div>
  );
}
