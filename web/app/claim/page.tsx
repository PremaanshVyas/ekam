import { createSupabaseServer } from "@/lib/auth-server";
import SignIn from "@/components/SignIn";
import { claimTile } from "./actions";

export const dynamic = "force-dynamic";

const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontFamily: "var(--font-ui), sans-serif", fontSize: 16,
  color: "var(--color-text-primary)", background: "var(--color-bg-surface)",
  border: "1.5px solid var(--color-border-default)", borderRadius: 8, padding: "12px 16px", outline: "none",
};
const label: React.CSSProperties = {
  fontFamily: "var(--font-ui), sans-serif", fontSize: 14, fontWeight: 500,
  color: "var(--color-text-muted)", display: "block", marginBottom: 6,
};

export default async function ClaimPage() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main style={{ minHeight: "100%", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "56px 24px" }}>
      <div style={{ width: 440, maxWidth: "100%", background: "var(--color-bg-elevated)", borderRadius: 16, padding: 32, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 4px 16px rgba(32,32,29,.16)" }}>
        <h1 style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 40, color: "var(--color-text-primary)", margin: 0 }}>claim a tile</h1>
        <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 16, color: "var(--color-text-secondary)", margin: 0 }}>one tile. one painting. one line about home.</p>

        {!user ? (
          <SignIn />
        ) : (
          <form action={claimTile} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>signed in as {user.email}</p>
            <div><label style={label}>your name</label><input name="name" style={field} placeholder="first name is fine" /></div>
            <div><label style={label}>where are you? (optional)</label><input name="loc" style={field} placeholder="Wyndham Vale, AU" /></div>
            <button type="submit" style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 16, fontWeight: 500, color: "var(--color-text-inverse)", background: "var(--palette-ink)", border: "none", borderRadius: 8, padding: 14, cursor: "pointer" }}>claim my tile</button>
            <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>one tile per person · you have 24h to paint it</p>
          </form>
        )}
      </div>
    </main>
  );
}
