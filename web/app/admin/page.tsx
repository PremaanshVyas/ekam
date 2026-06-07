import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { isAdmin } from "@/lib/admin-auth";
import { approve, reject } from "./actions";

export const dynamic = "force-dynamic";

type Pending = {
  id: string; x: number; y: number; story: string | null;
  artist_name: string | null; artist_location: string | null; image_path: string | null;
};

export default async function AdminPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const db = supabaseAdmin();
  const { data } = await db
    .from("tiles")
    .select("id, x, y, story, artist_name, artist_location, image_path")
    .eq("status", "pending")
    .order("claimed_at", { ascending: true });
  const pending = (data as Pending[]) ?? [];
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tiles/`;

  return (
    <main style={{ minHeight: "100%", display: "flex", justifyContent: "center", padding: "40px 24px 80px" }}>
      <div style={{ width: 600, maxWidth: "100%", display: "flex", flexDirection: "column", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 24, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>moderation queue</h1>
        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--color-text-muted)", margin: "0 0 8px" }}>
          {pending.length} pending · nothing publishes without your approval
        </p>
        {pending.length === 0 && (
          <p style={{ fontFamily: "var(--font-shantell), cursive", fontSize: 20, color: "var(--color-text-secondary)" }}>all caught up ✦</p>
        )}
        {pending.map((r) => (
          <div key={r.id} style={{ display: "flex", gap: 16, alignItems: "center", background: "var(--color-bg-surface)", border: "1px solid var(--color-border-default)", borderRadius: 8, padding: 12 }}>
            <div style={{ width: 72, height: 72, flexShrink: 0, borderRadius: 4, border: "1px solid var(--color-border-default)", background: r.image_path ? `center/cover url("${base}${r.image_path}")` : "var(--palette-paper)" }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-shantell), cursive", fontSize: 18, color: "var(--color-text-primary)" }}>“{r.story}”</div>
              <div style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>{r.artist_name} · tile {r.x},{r.y}{r.artist_location ? ` · ${r.artist_location}` : ""}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 96 }}>
              <form action={approve.bind(null, r.id)}>
                <button type="submit" style={{ width: "100%", fontFamily: "var(--font-inter), sans-serif", fontSize: 14, fontWeight: 500, color: "var(--color-text-inverse)", background: "var(--palette-pine)", border: "none", borderRadius: 4, padding: 8, cursor: "pointer" }}>approve</button>
              </form>
              <form action={reject.bind(null, r.id)}>
                <button type="submit" style={{ width: "100%", fontFamily: "var(--font-inter), sans-serif", fontSize: 14, fontWeight: 500, color: "var(--palette-rust)", background: "var(--color-bg-surface)", border: "1px solid var(--palette-rust)", borderRadius: 4, padding: 8, cursor: "pointer" }}>reject</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
