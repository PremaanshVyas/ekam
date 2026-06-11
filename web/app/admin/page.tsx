import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";
import { approve, reject, removeTile, screenTile } from "./actions";
import AdminImage from "@/components/AdminImage";
import AdminAutoRefresh from "@/components/AdminAutoRefresh";
import Logo from "@/components/Logo";

export const dynamic = "force-dynamic";

type Row = {
  id: string; x: number; y: number; status: string;
  story: string | null; artist_name: string | null; artist_email: string | null; artist_location: string | null;
  image_path: string | null; pending_image_path: string | null; pending_story: string | null;
  ai_verdict: string | null; ai_reason: string | null; review_requested_at: string | null;
};

const QUEUE_COLS = "id,x,y,status,story,artist_name,artist_email,artist_location,image_path,pending_image_path,pending_story,ai_verdict,ai_reason,review_requested_at";
const MID_COLS = "id,x,y,status,story,artist_name,artist_email,artist_location,image_path,pending_image_path,pending_story";
const SAFE_COLS = "id,x,y,status,story,artist_name,artist_email,artist_location,image_path";

// Tolerant of migrations 0003/0005/0006 not being run: fall back to progressively safer column sets.
async function fetchQueue(db: ReturnType<typeof supabaseAdmin>): Promise<Row[]> {
  const blank = { pending_image_path: null, pending_story: null, ai_verdict: null, ai_reason: null, review_requested_at: null };
  const grab = async (cols: string) => db.from("tiles").select(cols).or("status.eq.pending,pending_image_path.not.is.null").order("claimed_at", { ascending: true });
  let rows: Partial<Row>[] | null = null;
  for (const cols of [QUEUE_COLS, MID_COLS]) {
    const res = await grab(cols);
    if (!res.error) { rows = (res.data as unknown as Partial<Row>[]) ?? []; break; }
  }
  if (!rows) {
    const safe = await db.from("tiles").select(SAFE_COLS).eq("status", "pending").order("claimed_at", { ascending: true });
    rows = (safe.data as unknown as Partial<Row>[]) ?? [];
  }
  return rows
    .map((r) => ({ ...blank, ...r } as Row))
    // AI-returned edits stay hidden until the artist asks for a human review
    .filter((r) => r.status === "pending" || !r.pending_image_path || r.ai_verdict !== "reject" || !!r.review_requested_at);
}

// AI verdict chip: at-a-glance triage colour + the model's one-line reason.
function AiChip({ verdict, reason }: { verdict: string | null; reason: string | null }) {
  if (!verdict) return null;
  const look: Record<string, { bg: string; fg: string; label: string }> = {
    approve: { bg: "rgba(47,158,110,.16)", fg: "#5fcf8f", label: "AI: looks safe" },
    review: { bg: "rgba(224,162,58,.16)", fg: "#e0a23a", label: "AI: take a look" },
    reject: { bg: "rgba(211,87,63,.18)", fg: "#e8643c", label: "AI: flagged" },
    error: { bg: "rgba(239,233,225,.08)", fg: "var(--color-text-muted)", label: "AI: error" },
  };
  const l = look[verdict] ?? look.error;
  return (
    <div title={reason ?? undefined} style={{ display: "flex", alignItems: "baseline", gap: 7, marginTop: 6 }}>
      <span style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: l.fg, background: l.bg, borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>{l.label}</span>
      {reason && <span style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.35 }}>{reason}</span>}
    </div>
  );
}

type LogRow = {
  id: string; action: string; reason: string | null; created_at: string;
  tiles: { x: number; y: number; artist_name: string | null } | null;
};

const LOG_LOOK: Record<string, { fg: string; label: string }> = {
  "ai-approved": { fg: "#5fcf8f", label: "AI approved" },
  "ai-rejected": { fg: "#e8643c", label: "AI returned" },
  "ai-screened": { fg: "#e0a23a", label: "AI review" },
  "approved": { fg: "#5fcf8f", label: "approved" },
  "rejected": { fg: "#e8643c", label: "rejected" },
  "removed": { fg: "#e8643c", label: "removed" },
};

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const rawTab = (await searchParams).tab;
  const tab = rawTab === "painted" ? "painted" : rawTab === "log" ? "log" : "queue";
  const db = supabaseAdmin();
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tiles/`;

  // Counts for both tabs.
  const paintedCount = (await db.from("tiles").select("id", { count: "exact", head: true }).eq("status", "published")).count ?? 0;
  let queueCount = 0;
  const qc = await db.from("tiles").select("id", { count: "exact", head: true }).or("status.eq.pending,pending_image_path.not.is.null");
  queueCount = qc.error ? ((await db.from("tiles").select("id", { count: "exact", head: true }).eq("status", "pending")).count ?? 0) : (qc.count ?? 0);

  const queue = tab === "queue" ? await fetchQueue(db) : [];
  const painted = tab === "painted"
    ? ((await db.from("tiles").select(SAFE_COLS).eq("status", "published").order("published_at", { ascending: false })).data as Row[]) ?? []
    : [];
  const log = tab === "log"
    ? (((await db.from("moderation_log").select("id, action, reason, created_at, tiles(x, y, artist_name)").order("created_at", { ascending: false }).limit(80)).data as unknown as LogRow[]) ?? [])
    : [];

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: "var(--font-ui), sans-serif", fontSize: 15, fontWeight: 500, textDecoration: "none",
    color: active ? "var(--color-text-primary)" : "var(--color-text-muted)",
    borderBottom: `2px solid ${active ? "var(--palette-ink)" : "transparent"}`,
    padding: "6px 2px",
  });
  const meta: React.CSSProperties = { fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 };
  const emailStyle: React.CSSProperties = { fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-secondary)", marginTop: 1 };

  return (
    <main style={{ minHeight: "100%", display: "flex", justifyContent: "center", padding: "40px 24px 80px" }}>
      <div style={{ width: 640, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
        <AdminAutoRefresh />
        <Logo />
        <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 32, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>admin</h1>

        <div style={{ display: "flex", gap: 22, borderBottom: "1px solid var(--color-border-default)" }}>
          <Link href="/admin?tab=queue" style={tabStyle(tab === "queue")}>moderation queue · {queueCount}</Link>
          <Link href="/admin?tab=painted" style={tabStyle(tab === "painted")}>painted tiles · {paintedCount}</Link>
          <Link href="/admin?tab=log" style={tabStyle(tab === "log")}>log</Link>
        </div>

        {tab === "queue" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {queue.length === 0 && <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 20, color: "var(--color-text-secondary)" }}>all caught up ✦</p>}
            {queue.map((r) => {
              const isEdit = !!r.pending_image_path;
              const img = isEdit ? r.pending_image_path : r.image_path;
              const story = isEdit ? r.pending_story : r.story;
              return (
                <div key={r.id} style={{ display: "flex", gap: 16, alignItems: "center", background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 8, padding: 12 }}>
                  <AdminImage img={img} base={base} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "inline-block", fontFamily: "var(--font-ui), sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: isEdit ? "var(--palette-ink)" : "var(--color-text-inverse)", background: isEdit ? "var(--palette-honey)" : "var(--palette-pine)", borderRadius: 4, padding: "2px 7px", marginBottom: 5 }}>{isEdit ? "edit · live tile" : "new"}</span>
                    <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, color: "var(--color-text-primary)" }}>“{story}”</div>
                    <div style={meta}>{r.artist_name} · tile {r.x},{r.y}{r.artist_location ? ` · ${r.artist_location}` : ""}</div>
                    <div style={emailStyle}>{r.artist_email}</div>
                    <AiChip verdict={r.ai_verdict} reason={r.ai_reason} />
                    {r.review_requested_at && <div style={{ marginTop: 6 }}><span style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--accent)", border: "1px solid var(--accent)", borderRadius: 4, padding: "2px 7px" }}>artist requested review</span></div>}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 96 }}>
                    <form action={approve.bind(null, r.id)}>
                      <button type="submit" style={{ width: "100%", fontFamily: "var(--font-ui), sans-serif", fontSize: 14, fontWeight: 500, color: "var(--color-text-inverse)", background: "var(--palette-pine)", border: "none", borderRadius: 4, padding: 8, cursor: "pointer" }}>approve</button>
                    </form>
                    <form action={reject.bind(null, r.id)}>
                      <button type="submit" style={{ width: "100%", fontFamily: "var(--font-ui), sans-serif", fontSize: 14, fontWeight: 500, color: "var(--palette-rust)", background: "var(--color-bg-surface)", border: "1px solid var(--palette-rust)", borderRadius: 4, padding: 8, cursor: "pointer" }}>reject</button>
                    </form>
                    <form action={screenTile.bind(null, r.id)}>
                      <button type="submit" title="Run the AI screen on this tile now" style={{ width: "100%", fontFamily: "var(--font-ui), sans-serif", fontSize: 12, color: "var(--color-text-secondary)", background: "none", border: "1px solid var(--color-border-default)", borderRadius: 4, padding: 6, cursor: "pointer" }}>AI screen</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        ) : tab === "log" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 8px" }}>Every moderation action, newest first. AI actions happen seconds after each submission.</p>
            {log.length === 0 && <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 20, color: "var(--color-text-secondary)" }}>nothing logged yet.</p>}
            {log.map((l) => {
              const look = LOG_LOOK[l.action] ?? { fg: "var(--color-text-muted)", label: l.action };
              const when = l.created_at.slice(5, 16).replace("T", " · ");
              return (
                <div key={l.id} style={{ display: "flex", gap: 12, alignItems: "baseline", padding: "9px 2px", borderBottom: "1px solid var(--color-border-default)" }}>
                  <span style={{ fontFamily: "var(--font-ui), monospace", fontSize: 11, color: "var(--color-text-muted)", flex: "none", width: 78 }}>{when}</span>
                  <span style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: look.fg, flex: "none", width: 92 }}>{look.label}</span>
                  <span style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-primary)", flex: "none" }}>
                    {l.tiles ? `R${String(l.tiles.y + 1).padStart(2, "0")}·C${String(l.tiles.x + 1).padStart(2, "0")}` : "—"}{l.tiles?.artist_name ? ` · ${l.tiles.artist_name}` : ""}
                  </span>
                  <span style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 12.5, color: "var(--color-text-secondary)", lineHeight: 1.4 }}>{l.reason ?? ""}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>{paintedCount} live on the canvas · “remove” frees the tile + email to be claimed again.</p>
            {painted.length === 0 && <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 20, color: "var(--color-text-secondary)" }}>nothing published yet.</p>}
            {painted.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 16, alignItems: "center", background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 8, padding: 12 }}>
                <AdminImage img={r.image_path} base={base} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, color: "var(--color-text-primary)" }}>“{r.story}”</div>
                  <div style={meta}>{r.artist_name} · tile {r.x},{r.y}{r.artist_location ? ` · ${r.artist_location}` : ""}</div>
                  <div style={emailStyle}>{r.artist_email}</div>
                </div>
                <div style={{ width: 96 }}>
                  <form action={removeTile.bind(null, r.id)}>
                    <button type="submit" style={{ width: "100%", fontFamily: "var(--font-ui), sans-serif", fontSize: 14, fontWeight: 500, color: "var(--palette-rust)", background: "var(--color-bg-surface)", border: "1px solid var(--palette-rust)", borderRadius: 4, padding: 8, cursor: "pointer" }}>remove</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
