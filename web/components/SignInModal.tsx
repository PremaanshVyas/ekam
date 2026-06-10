"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/auth-browser";

// Sign in via Supabase email OTP WITHOUT claiming — for returning people who already
// have a tile and just want back in to paint/edit it.
export default function SignInModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const send = async () => {
    if (!valid) return; setBusy(true); setErr("");
    const { error } = await createSupabaseBrowser().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    setBusy(false); if (error) setErr(error.message); else setStep("code");
  };
  const verify = async () => {
    if (busy || code.trim().length < 6) return; setBusy(true); setErr("");
    const { error } = await createSupabaseBrowser().auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (error) { setBusy(false); setErr(error.message); return; }
    setStep("done");
    router.refresh();
    setTimeout(onClose, 1100); // show the confirmation, then get out of the way
  };

  return (
    <div className="modal-scrim" onClick={step === "done" ? undefined : onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="panel__head">
          <span className="panel__eyebrow"><span className="studio__dot" style={{ background: "var(--accent)" }} />Sign in</span>
          <button className="panel__x" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {step === "email" ? (
          <>
            <h3 className="claim__t">Welcome back.</h3>
            <p className="claim__d">Enter your email and we&apos;ll send a code. This is how you get back to your tile to paint or edit it.</p>
            <div className="co__field"><label>Email</label>
              <input className="co__input co__inputlive" type="email" placeholder="you@email.com" value={email} autoFocus onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
            </div>
            {err && <p className="claim__err">{err}</p>}
            <button className={"btn btn--primary btn--block" + (busy ? " btn--loading" : "")} disabled={!valid || busy} onClick={send}>{busy ? "Sending code…" : "Send me a code"}</button>
            <p className="claim__fine">No password, just a code to prove it&apos;s you.</p>
          </>
        ) : step === "code" ? (
          <>
            <button className="panel__back" onClick={() => { setStep("email"); setErr(""); }}>‹ Back</button>
            <h3 className="claim__t">Check your inbox.</h3>
            <p className="claim__d">We sent a code to <b>{email}</b>. Enter it to sign in.</p>
            <div className="co__field"><label>Code</label>
              <input className="co__input co__inputlive" inputMode="numeric" autoFocus placeholder="your code"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} onKeyDown={(e) => e.key === "Enter" && verify()}
                style={{ letterSpacing: 6, textAlign: "center", fontFamily: "var(--mono)", fontSize: 20 }} />
            </div>
            {err && <p className="claim__err">{err}</p>}
            <button className={"btn btn--primary btn--block" + (busy ? " btn--loading" : "")} disabled={busy || code.trim().length < 6} onClick={verify}>{busy ? "Verifying…" : "Verify code"}</button>
          </>
        ) : (
          <div className="done" style={{ paddingTop: 14, paddingBottom: 8 }}>
            <div className="done__check done__check--pop">✓</div>
            <h3 className="done__t">Signed in.</h3>
            <p className="done__d">Welcome back, you&apos;re all set.</p>
          </div>
        )}
      </div>
    </div>
  );
}
