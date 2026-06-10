"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MosaicCanvas, { type MosaicApi } from "@/components/MosaicCanvas";
import Studio from "@/components/Studio";
import { createRealWall, type RealTileInput } from "@/lib/realWall";
import type { Wall, TileInfo } from "@/lib/demoWall";
import { createSupabaseBrowser } from "@/lib/auth-browser";
import { claimTileAt } from "@/app/canvas/actions";
import { submitTile, saveDraft } from "@/app/paint/actions";
import { signOut } from "@/app/actions";
import SignInModal from "@/components/SignInModal";

type MyTile = { id: string; idx: number; status: string; artUrl: string | null; story: string | null; draftUrl: string | null; draftStory: string | null };
type Panel = "detail" | "claim" | "studio" | "submitted" | null;
type ViewMode = "claimed" | "all";

// ── crisp tile / neighborhood render ──
function TileArt({ wall, idx, region = 1, version, artUrl, className }: { wall: Wall; idx: number; region?: number; version: number; artUrl?: string | null; className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current; if (!cv || !wall.hi) return;
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
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
        <><div className="tip__row"><span className="tip__handle">{info.mine ? "your tile" : info.handle && info.handle !== "—" ? info.handle : "claimed"}</span></div><div className="tip__meta">{info.id} · {info.handle === "—" ? "being painted" : "on the wall"}</div></>
      ) : (
        <><div className="tip__row"><span className="tip__handle">Open tile</span></div><div className="tip__meta">{info.id}</div><div className="tip__cta">Click to claim →</div></>
      )}
    </div>
  );
}

function Sidebar({ open, setOpen, claimed, total }: { open: boolean; setOpen: (v: boolean) => void; claimed: number; total: number }) {
  const pct = total ? (claimed / total) * 100 : 0;
  return (
    <aside className={"side" + (open ? "" : " side--closed")}>
      <button className="side__toggle" onClick={() => setOpen(!open)}>{open ? "‹" : "›"}</button>
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
            <li><b>Tap an open tile</b> and verify your email with a one-time code.</li>
            <li><b>Paint what home looks like</b> on your blank tile.</li>
            <li><b>Submit</b> — after a quick review it joins the wall with your name.</li>
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
        <button className="dock__btn" onClick={() => api.current?.zoomOut()}>−</button>
        <div className="dock__zoomlabel">{zoomLabel}</div>
        <button className="dock__btn" onClick={() => api.current?.zoomIn()}>+</button>
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

const OTP_LEN = 8; // ekam's Supabase issues 8-digit email codes
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
        <input key={i} ref={(el) => { refs.current[i] = el; }} className="otp__box" inputMode="numeric"
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
  const [err, setErr] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const doClaim = async () => {
    setBusy(true); setErr("");
    const res = await claimTileAt(info.idx);
    if (res.ok) { onClaimed(res.tileId); return; }
    setBusy(false);
    if (res.error === "have-tile") setErr("you already have a tile — edit that one instead.");
    else if (res.error === "taken") setErr("someone just claimed this tile — close this and pick another.");
    else setErr("couldn't claim — try again.");
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
    await doClaim();
  };

  return (
    <div className="panel panel--claim">
      <div className="panel__head">
        <span className="panel__eyebrow"><span className="studio__dot" style={{ background: accent }} />Claim · {info.id}</span>
        <button className="panel__x" onClick={onClose}>✕</button>
      </div>

      {hasTile ? (
        <>
          <div className="claim__art"><TileArt wall={wall} idx={info.idx} region={5} version={version} className="detail__nbcanvas" /></div>
          <h3 className="claim__t">You already have a tile.</h3>
          <p className="claim__d">One tile per person — yours is at <b>{myLabel}</b>. Head there to paint or edit it.</p>
          <button className="btn btn--primary btn--block" onClick={onZoomMine}>Go to your tile</button>
        </>
      ) : step === "confirm" ? (
        <>
          <div className="claim__art"><TileArt wall={wall} idx={info.idx} region={5} version={version} className="detail__nbcanvas" /></div>
          <h3 className="claim__t">This tile is open.</h3>
          <p className="claim__d">Claim {info.id} as <b>{userEmail}</b> — it&apos;s yours to paint.</p>
          {err && <p className="claim__err">{err}</p>}
          <button className={"btn btn--primary btn--block" + (busy ? " btn--loading" : "")} disabled={busy} onClick={doClaim}>{busy ? "claiming…" : "Claim this tile"}</button>
          <p className="claim__fine">One tile per person.</p>
        </>
      ) : step === "email" ? (
        <>
          <div className="claim__art"><TileArt wall={wall} idx={info.idx} region={5} version={version} className="detail__nbcanvas" /></div>
          <h3 className="claim__t">This tile is open.</h3>
          <p className="claim__d">Claim it with your email — we&apos;ll send a one-time code to prove it&apos;s you. No password, no account.</p>
          <div className="co__field"><label>Email</label>
            <input className="co__input co__inputlive" type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
          </div>
          {err && <p className="claim__err">{err}</p>}
          <button className={"btn btn--primary btn--block" + (busy ? " btn--loading" : "")} disabled={!valid || busy} onClick={send}>{busy ? "sending code…" : "send me a code"}</button>
          <p className="claim__fine">We only use your email to verify this one tile.</p>
        </>
      ) : (
        <>
          <button className="panel__back" onClick={() => setStep("email")}>‹ Back</button>
          <div className="claim__mail">✉</div>
          <h3 className="claim__t">Check your inbox.</h3>
          <p className="claim__d">We sent a 6-digit code to <b>{email}</b>. Enter it to claim {info.id}.</p>
          <OTPInput onComplete={verify} />
          {err && <p className="claim__err">{err}</p>}
          <p className="claim__fine">{busy ? "verifying…" : "the code auto-submits when you finish typing."}</p>
        </>
      )}
    </div>
  );
}

function TileDetail({ wall, info, version, myTile, onClose, onZoom, onEdit }: {
  wall: Wall; info: TileInfo; version: number; myTile: MyTile | null;
  onClose: () => void; onZoom: () => void; onEdit: () => void;
}) {
  const mineArt = info.mine ? myTile?.artUrl ?? null : null;
  const published = info.handle && info.handle !== "—" && info.handle !== "you";
  return (
    <div className="panel panel--detail">
      <div className="panel__head">
        <span className="panel__eyebrow"><span className="studio__dot" style={{ background: wall.accent }} />{info.mine ? "Your tile" : "A tile"}</span>
        <button className="panel__x" onClick={onClose}>✕</button>
      </div>
      <div className="detail__art"><TileArt wall={wall} idx={info.idx} version={version} artUrl={mineArt} className="detail__canvas" /></div>
      <div className="detail__id">{info.id}<span className="detail__num">№ {info.num} of {wall.N_TOTAL}</span></div>
      <div className="owner">
        <div className="owner__avatar" style={{ background: wall.accent }}>{(info.handle || "?").slice(0, 1).toUpperCase()}</div>
        <div className="owner__meta">
          <span className="owner__handle">{info.mine ? "you" : info.handle || "someone"}</span>
          <span className="owner__joined">{info.mine ? (myTile?.status === "published" ? "on the wall" : myTile?.status === "pending" ? "in review" : "claimed — not painted yet") : published ? "on the wall" : "being painted"}</span>
        </div>
      </div>
      {info.note && <blockquote className="owner__note">“{info.note}”</blockquote>}
      {info.mine && myTile?.story && !info.note && <blockquote className="owner__note">“{myTile.story}”</blockquote>}
      <div className="detail__nb">
        <div className="side__label">Neighbourhood</div>
        <TileArt wall={wall} idx={info.idx} region={5} version={version} className="detail__nbcanvas" />
        <p className="detail__nbhint">Every painted tile here was made by a different person.</p>
      </div>
      {info.mine
        ? <button className="btn btn--primary btn--block" onClick={onEdit}>{myTile?.status === "claimed" ? "Paint your tile" : "Edit your tile"}</button>
        : <button className="btn btn--ghost btn--block" onClick={onZoom}>Zoom to this tile</button>}
    </div>
  );
}

export default function Explorer({ cols, total, tiles, claimed, email, myTile, autoOpenMine }: {
  cols: number; total: number; tiles: RealTileInput[]; claimed: number; email: string | null; myTile: MyTile | null; autoOpenMine?: boolean;
}) {
  const router = useRouter();
  const api = useRef<MosaicApi | null>(null);
  const [wall, setWall] = useState<Wall | null>(null);
  const [ver, setVer] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("claimed");
  const [hover, setHover] = useState<{ info: TileInfo; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<TileInfo | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [sideOpen, setSideOpen] = useState(true);
  const [zoomLabel, setZoomLabel] = useState("Wall");
  const studioTarget = useRef<{ tileId: string; idx: number; label: string; artUrl: string | null; note: string } | null>(null);
  const [signInOpen, setSignInOpen] = useState(false);
  const openedMine = useRef(false);

  const myIdx = myTile?.idx ?? -1;
  const accent = "#e8643c";

  useEffect(() => {
    const w = createRealWall(cols, tiles, myIdx, () => setVer((v) => v + 1));
    setWall(w); setVer((v) => v + 1);
  }, [cols, tiles, myIdx]);

  useEffect(() => { const id = setInterval(() => { if (api.current) setZoomLabel(api.current.getZoomLabel()); }, 250); return () => clearInterval(id); }, []);

  const onHover = useCallback((info: TileInfo | null, x?: number, y?: number) => setHover(info ? { info, x: x ?? 0, y: y ?? 0 } : null), []);
  const onSelect = useCallback((info: TileInfo) => { setSelected(info); setHover(null); setPanel(info.claimed ? "detail" : "claim"); }, []);
  const closeAll = () => { setPanel(null); setSelected(null); };

  const myLabel = myTile ? "R" + String((Math.floor(myTile.idx / cols)) + 1).padStart(2, "0") + "·C" + String((myTile.idx % cols) + 1).padStart(2, "0") : "";
  const openMine = useCallback(() => {
    if (!myTile || !wall) return;
    setSelected(wall.infoFor(myTile.idx)); setPanel("detail"); setHover(null);
    api.current?.zoomToTile(myTile.idx, 96);
  }, [myTile, wall]);
  useEffect(() => {
    if (!autoOpenMine || !myTile || !wall || openedMine.current) return;
    openedMine.current = true; const mi = myTile.idx;
    setSelected(wall.infoFor(mi)); setPanel("detail");
    setTimeout(() => api.current?.zoomToTile(mi, 96), 90);
  }, [autoOpenMine, myTile, wall]);

  const openStudioForClaim = (tileId: string) => { if (!selected) return; studioTarget.current = { tileId, idx: selected.idx, label: selected.id, artUrl: null, note: "" }; setPanel("studio"); };
  // Resume from the latest autosaved draft if there is one; else the submitted/published image.
  const openStudioForEdit = () => { if (!myTile || !wall) return; const label = wall.infoFor(myTile.idx).id; studioTarget.current = { tileId: myTile.id, idx: myTile.idx, label, artUrl: myTile.draftUrl ?? myTile.artUrl, note: myTile.draftStory ?? myTile.story ?? "" }; setPanel("studio"); };
  const onStudioSubmit = async (dataUrl: string, note: string) => { const t = studioTarget.current; if (!t) return; await submitTile(t.tileId, dataUrl, note); setPanel("submitted"); router.refresh(); };
  const onSaveDraft = async (dataUrl: string, note: string) => { const t = studioTarget.current; if (!t) return { ok: false }; return await saveDraft(t.tileId, dataUrl, note); };

  if (!wall) return <div className="explorer" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)", fontFamily: "var(--mono)" }}>loading the wall…</div>;

  return (
    <div className="explorer">
      <div className="ex__canvas">
        <MosaicCanvas wall={wall} interactive grid viewMode={viewMode} version={ver} accent={accent}
          apiRef={api} onHover={onHover} onSelect={onSelect}
          selectedIdx={selected ? selected.idx : -1} hoverIdx={hover ? hover.info.idx : -1} initialZoom="macro" />
        <div className="ex__grain" />
      </div>

      <div className="ex__topbar">
        <Link className="ex__home" href="/">‹ <span className="wordmark wordmark--sm">ekam.ink</span></Link>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span className="ex__edition">Canvas Nº 001 · live</span>
          {email ? (
            <>
              {myTile && <button className="linkbtn" onClick={openMine}>your tile</button>}
              <form action={signOut} style={{ display: "inline" }}><button type="submit" className="linkbtn">sign out</button></form>
            </>
          ) : (
            <button className="linkbtn" onClick={() => setSignInOpen(true)}>sign in</button>
          )}
        </div>
      </div>

      <Sidebar open={sideOpen} setOpen={setSideOpen} claimed={claimed} total={total} />
      <Tooltip hover={hover} />
      <Dock api={api} viewMode={viewMode} setViewMode={setViewMode} zoomLabel={zoomLabel} />

      {panel && panel !== "studio" && selected && (
        <div className="panelwrap">
          {panel === "detail" && <TileDetail wall={wall} info={selected} version={ver} myTile={myTile} onClose={closeAll} onZoom={() => api.current?.zoomToTile(selected.idx, 96)} onEdit={openStudioForEdit} />}
          {panel === "claim" && <ClaimFlow wall={wall} info={selected} version={ver} accent={accent} signedIn={!!email} userEmail={email} hasTile={!!myTile} myLabel={myLabel} onClose={closeAll} onClaimed={openStudioForClaim} onZoomMine={openMine} />}
          {panel === "submitted" && (
            <div className="panel">
              <div className="panel__head"><span className="panel__eyebrow"><span className="studio__dot" style={{ background: accent }} />Submitted</span><button className="panel__x" onClick={() => { closeAll(); }}>✕</button></div>
              <div className="done" style={{ paddingTop: 18 }}>
                <div className="done__check">✓</div>
                <h3 className="done__t">It&apos;s in the queue.</h3>
                <p className="done__d">Your tile goes for a quick review, then appears on the wall with your name. Thank you for adding to the canvas.</p>
                <button className="btn btn--primary btn--block" onClick={() => { closeAll(); router.refresh(); }}>Back to the wall</button>
              </div>
            </div>
          )}
        </div>
      )}

      {panel === "studio" && studioTarget.current && (
        <Studio tileLabel={studioTarget.current.label} initialArtUrl={studioTarget.current.artUrl} initialNote={studioTarget.current.note} accent={accent} onClose={() => setPanel(myTile ? "detail" : null)} onSubmit={onStudioSubmit} onSaveDraft={onSaveDraft} />
      )}

      <div className="ex__hint">Scroll to zoom · drag to pan · click a tile</div>
      {signInOpen && <SignInModal onClose={() => setSignInOpen(false)} />}
    </div>
  );
}
