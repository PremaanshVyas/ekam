"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/auth-browser";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/claim` },
    });
    setLoading(false);
    if (error) setErr(error.message);
    else setSent(true);
  };

  if (sent) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <p style={{ fontFamily: "var(--font-shantell), cursive", fontSize: 22, color: "var(--color-text-primary)", margin: 0 }}>check your inbox ✦</p>
        <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 15, color: "var(--color-text-secondary)", margin: 0 }}>
          we sent a magic link to <strong>{email}</strong>. click it and you&apos;ll come right back here to claim your tile.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 14, fontWeight: 500, color: "var(--color-text-muted)" }}>your email — never shown publicly</label>
      <input
        type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com"
        style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--font-inter), sans-serif", fontSize: 16, color: "var(--color-text-primary)", background: "var(--color-bg-surface)", border: "1.5px solid var(--color-border-default)", borderRadius: 8, padding: "12px 16px", outline: "none" }}
      />
      {err && <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--palette-rust)", margin: 0 }}>{err}</p>}
      <button type="submit" disabled={loading} style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 16, fontWeight: 500, color: "var(--color-text-inverse)", background: "var(--palette-ink)", border: "none", borderRadius: 8, padding: 14, cursor: loading ? "default" : "pointer", opacity: loading ? 0.6 : 1 }}>
        {loading ? "sending…" : "send me a magic link"}
      </button>
      <p style={{ fontFamily: "var(--font-inter), sans-serif", fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>no password — just a link to confirm it&apos;s you.</p>
    </form>
  );
}
