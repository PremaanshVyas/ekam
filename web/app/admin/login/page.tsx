import { login } from "./actions";

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main style={{ minHeight: "100%", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "72px 24px" }}>
      <form
        action={login}
        style={{ width: 360, maxWidth: "100%", background: "var(--color-bg-elevated)", borderRadius: 16, padding: 32, display: "flex", flexDirection: "column", gap: 14, boxShadow: "0 4px 16px rgba(32,32,29,.16)" }}
      >
        <h1 style={{ fontFamily: "var(--font-shantell), cursive", fontSize: 32, color: "var(--color-text-primary)", margin: 0 }}>moderation</h1>
        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, color: "var(--color-text-muted)", margin: 0 }}>admins only — enter the passphrase.</p>
        <input
          name="password" type="password" required autoFocus placeholder="passphrase"
          style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--font-inter), sans-serif", fontSize: 16, color: "var(--color-text-primary)", background: "var(--color-bg-surface)", border: "1.5px solid var(--color-border-default)", borderRadius: 8, padding: "12px 16px", outline: "none" }}
        />
        {error && <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--palette-rust)", margin: 0 }}>wrong passphrase — try again.</p>}
        <button type="submit" style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 16, fontWeight: 500, color: "var(--color-text-inverse)", background: "var(--palette-ink)", border: "none", borderRadius: 8, padding: 14, cursor: "pointer" }}>enter</button>
      </form>
    </main>
  );
}
