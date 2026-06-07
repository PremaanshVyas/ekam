import Link from "next/link";
import { createSupabaseServer } from "@/lib/auth-server";
import { supabaseAdmin, CANVAS_SLUG } from "@/lib/supabase";
import { findMyTile, tileImageUrl } from "@/lib/tiles";
import SiteHeader from "@/components/SiteHeader";
import SignIn from "@/components/SignIn";

export const dynamic = "force-dynamic";

const overline: React.CSSProperties = {
  fontFamily: "var(--font-ui), sans-serif", textTransform: "uppercase", letterSpacing: "0.18em",
  fontSize: 11, fontWeight: 500, color: "var(--color-text-muted)",
};
const primary: React.CSSProperties = {
  fontFamily: "var(--font-ui), sans-serif", fontSize: 15, fontWeight: 500,
  color: "var(--color-text-inverse)", background: "var(--palette-ink)",
  borderRadius: 6, padding: "12px 22px", textDecoration: "none", display: "inline-block",
};
const ghost: React.CSSProperties = {
  fontFamily: "var(--font-ui), sans-serif", fontSize: 15, fontWeight: 500,
  color: "var(--color-text-primary)", background: "var(--color-bg-elevated)",
  border: "1px solid var(--color-border-strong)", borderRadius: 6, padding: "11px 21px", textDecoration: "none", display: "inline-block",
};
const card: React.CSSProperties = {
  width: 460, maxWidth: "100%", background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)",
  borderRadius: 12, padding: 32, display: "flex", flexDirection: "column", gap: 14,
  boxShadow: "0 4px 16px rgba(26,24,19,.08)",
};
const wrap: React.CSSProperties = { minHeight: "60vh", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "56px 24px" };

export default async function MePage() {
  const auth = await createSupabaseServer();
  const { data: { user } } = await auth.auth.getUser();

  // ── Signed out → sign in right here ──
  if (!user?.email) {
    return (
      <>
        <SiteHeader email={null} />
        <main style={wrap}>
          <div style={card}>
            <span style={overline}>your tile</span>
            <h1 className="serif" style={{ fontSize: 36, margin: 0, color: "var(--color-text-primary)" }}>sign in to submit</h1>
            <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 15, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>
              your tile is tied to your email — sign in to claim one, paint it, and edit it anytime.
            </p>
            <SignIn />
          </div>
        </main>
      </>
    );
  }

  const db = supabaseAdmin();
  const { data: canvas } = await db.from("canvases").select("id").eq("slug", CANVAS_SLUG).maybeSingle();
  const tile = canvas ? await findMyTile(db, canvas.id, user.email) : null;

  // ── Signed in, no tile → make your first submission ──
  if (!tile) {
    return (
      <>
        <SiteHeader email={user.email} />
        <main style={wrap}>
          <div style={card}>
            <span style={overline}>your tile</span>
            <h1 className="serif" style={{ fontSize: 36, margin: 0, color: "var(--color-text-primary)" }}>make your first mark</h1>
            <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 15, color: "var(--color-text-secondary)", margin: 0, lineHeight: 1.5 }}>
              you haven&apos;t claimed a tile yet. pick one on the canvas and paint what home looks like — it&apos;s yours to keep and edit.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
              <Link href="/claim" className="lift" style={primary}>claim a tile</Link>
              <Link href="/" className="lift" style={ghost}>explore the canvas</Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  // ── Has a tile → dashboard ──
  const liveImg = tileImageUrl(tile.image_path);
  const hasPendingEdit = !!tile.pending_image_path;
  const isClaimedOnly = tile.status === "claimed";
  const onCanvas = tile.status === "published";

  let badge: { label: string; bg: string; fg: string };
  if (isClaimedOnly) badge = { label: "not painted yet", bg: "var(--color-bg-surface)", fg: "var(--color-text-secondary)" };
  else if (tile.status === "pending") badge = { label: "in moderation", bg: "var(--palette-honey)", fg: "var(--palette-ink)" };
  else if (hasPendingEdit) badge = { label: "on the canvas · update in review", bg: "var(--palette-honey)", fg: "var(--palette-ink)" };
  else badge = { label: "on the canvas ✓", bg: "var(--palette-pine)", fg: "var(--color-text-inverse)" };

  return (
    <>
      <SiteHeader email={user.email} />
      <main style={wrap}>
        <div style={{ ...card, width: 520 }}>
          <span style={overline}>your tile · {tile.x},{tile.y}</span>
          <h1 className="serif" style={{ fontSize: 36, margin: 0, color: "var(--color-text-primary)" }}>your tile</h1>

          <div style={{ display: "flex", gap: 18, marginTop: 6, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ width: 132, height: 132, flexShrink: 0, borderRadius: 6, border: "1px solid var(--color-border-default)", backgroundColor: "var(--palette-paper)", backgroundImage: liveImg ? `url("${liveImg}")` : undefined, backgroundSize: "cover", backgroundPosition: "center" }} />
            <div style={{ flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ alignSelf: "flex-start", fontFamily: "var(--font-ui), sans-serif", fontSize: 12, fontWeight: 600, color: badge.fg, background: badge.bg, border: "1px solid var(--color-border-default)", borderRadius: 9999, padding: "4px 12px" }}>{badge.label}</span>
              {tile.story && <p className="serif" style={{ fontSize: 19, margin: 0, lineHeight: 1.3, color: "var(--color-text-primary)" }}>“{tile.story}”</p>}
              {isClaimedOnly && <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>you&apos;ve claimed this tile — paint it whenever you like.</p>}
              {tile.status === "pending" && <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>it&apos;ll appear on the canvas once it&apos;s reviewed.</p>}
              {hasPendingEdit && <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>your update is in review — your current tile stays on the canvas until it&apos;s approved.</p>}
            </div>
          </div>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
            <Link href="/paint" className="lift" style={primary}>{isClaimedOnly ? "paint your tile" : "edit your tile"}</Link>
            {onCanvas && <Link href="/#canvas" className="lift" style={ghost}>see it on the canvas</Link>}
          </div>
        </div>
      </main>
    </>
  );
}
