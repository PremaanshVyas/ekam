import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";
import { approve, reject } from "./actions";

export const dynamic = "force-dynamic";

type Pending = {
  id: string; x: number; y: number; status: string;
  story: string | null; artist_name: string | null; artist_location: string | null;
  image_path: string | null; pending_image_path: string | null; pending_story: string | null;
};

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const db = supabaseAdmin();
  const { data } = await db
    .from("tiles")
    .select("id, x, y, status, story, artist_name, artist_location, image_path, pending_image_path, pending_story")
    .or("status.eq.pending,pending_image_path.not.is.null")
    .order("claimed_at", { ascending: true });
  const queue = (data as Pending[]) ?? [];
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tiles/`;

  return (
    <main style={{ minHeight: "100%", display: "flex", justifyContent: "center", padding: "40px 24px 80px" }}>
      <div style={{ width: 600, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 30, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>moderation queue</h1>
        <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
          {queue.length} waiting · nothing publishes (or changes) without your approval
        </p>
        {queue.length === 0 && (
          <p style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 20, color: "var(--color-text-secondary)" }}>all caught up ✦</p>
        )}
        {queue.map((r) => {
          const isEdit = !!r.pending_image_path;
          const img = isEdit ? r.pending_image_path : r.image_path;
          const story = isEdit ? r.pending_story : r.story;
          return (
            <div key={r.id} style={{ display: "flex", gap: 16, alignItems: "center", background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 8, padding: 12 }}>
              <div style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 4, border: "1px solid var(--color-border-default)", background: img ? `center/cover url("${base}${img}")` : "var(--palette-paper)" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "inline-block", fontFamily: "var(--font-ui), sans-serif", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: isEdit ? "var(--palette-ink)" : "var(--color-text-inverse)", background: isEdit ? "var(--palette-honey)" : "var(--palette-pine)", borderRadius: 4, padding: "2px 7px", marginBottom: 5 }}>
                  {isEdit ? "edit · live tile" : "new"}
                </span>
                <div style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: 18, color: "var(--color-text-primary)" }}>“{story}”</div>
                <div style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>{r.artist_name} · tile {r.x},{r.y}{r.artist_location ? ` · ${r.artist_location}` : ""}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 96 }}>
                <form action={approve.bind(null, r.id)}>
                  <button type="submit" style={{ width: "100%", fontFamily: "var(--font-ui), sans-serif", fontSize: 14, fontWeight: 500, color: "var(--color-text-inverse)", background: "var(--palette-pine)", border: "none", borderRadius: 4, padding: 8, cursor: "pointer" }}>approve</button>
                </form>
                <form action={reject.bind(null, r.id)}>
                  <button type="submit" style={{ width: "100%", fontFamily: "var(--font-ui), sans-serif", fontSize: 14, fontWeight: 500, color: "var(--palette-rust)", background: "var(--color-bg-surface)", border: "1px solid var(--palette-rust)", borderRadius: 4, padding: 8, cursor: "pointer" }}>reject</button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
