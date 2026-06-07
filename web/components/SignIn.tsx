"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/auth-browser";

const field: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", fontFamily: "var(--font-ui), sans-serif", fontSize: 16,
  color: "var(--color-text-primary)", background: "var(--color-bg-surface)",
  border: "1.5px solid var(--color-border-default)", borderRadius: 8, padding: "12px 16px", outline: "none",
};
const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-ui), sans-serif", fontSize: 14, fontWeight: 500, color: "var(--color-text-muted)",
};
const btn: React.CSSProperties = {
  fontFamily: "var(--font-ui), sans-serif", fontSize: 16, fontWeight: 500, color: "var(--color-text-inverse)",
  background: "var(--palette-ink)", border: "none", borderRadius: 8, padding: 14, cursor: "pointer",
};

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setLoading(false);
    if (error) setErr(error.message);
    else setStep("code");
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErr("");
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (error) {
      setLoading(false);
      setErr(error.message);
      return;
    }
    router.refresh(); // /claim re-renders signed-in → shows the claim form
  };

  if (step === "code") {
    return (
      <form onSubmit={verify} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 15, color: "var(--color-text-secondary)", margin: 0 }}>
          we emailed a code to <strong>{email}</strong>. enter it below.
        </p>
        <input
          value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
          inputMode="numeric" autoComplete="one-time-code" autoFocus placeholder="enter your code"
          style={{ ...field, fontSize: 22, letterSpacing: 6, textAlign: "center" }}
        />
        {err && <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--palette-rust)", margin: 0 }}>{err}</p>}
        <button type="submit" disabled={loading || code.length < 6} style={{ ...btn, opacity: loading || code.length < 6 ? 0.6 : 1 }}>
          {loading ? "checking…" : "verify & continue"}
        </button>
        <button type="button" onClick={() => { setStep("email"); setCode(""); setErr(""); }}
          style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer", alignSelf: "flex-start" }}>
          ← use a different email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={sendCode} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={labelStyle}>your email — never shown publicly</label>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" style={field} />
      {err && <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--palette-rust)", margin: 0 }}>{err}</p>}
      <button type="submit" disabled={loading} style={{ ...btn, opacity: loading ? 0.6 : 1 }}>
        {loading ? "sending…" : "email me a code"}
      </button>
      <p style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", margin: 0 }}>no password — we&apos;ll email you a 6-digit code.</p>
    </form>
  );
}
