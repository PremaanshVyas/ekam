import Link from "next/link";
import { signOut } from "@/app/actions";

const navLink: React.CSSProperties = {
  fontFamily: "var(--font-ui), sans-serif", fontSize: 14, color: "var(--color-text-secondary)", textDecoration: "none",
};
const primary: React.CSSProperties = {
  fontFamily: "var(--font-ui), sans-serif", fontSize: 14, fontWeight: 500,
  color: "var(--color-text-inverse)", background: "var(--palette-ink)",
  borderRadius: 4, padding: "9px 18px", textDecoration: "none", display: "inline-block",
};

export default function SiteHeader({ email }: { email: string | null }) {
  return (
    <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "20px 32px", borderBottom: "1px solid var(--color-border-default)", flexWrap: "wrap" }}>
      <Link href="/" style={{ textDecoration: "none" }}>
        <span className="serif" style={{ fontSize: 24, fontWeight: 500, color: "var(--color-text-primary)" }}>ekam.ink</span>
      </Link>
      <nav style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
        <Link href="/#canvas" style={navLink}>the canvas</Link>
        {email ? (
          <>
            <span title={email} style={{ fontFamily: "var(--font-ui), sans-serif", fontSize: 13, color: "var(--color-text-muted)", maxWidth: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email}</span>
            <form action={signOut} style={{ display: "inline" }}>
              <button type="submit" style={{ ...navLink, background: "none", border: "none", cursor: "pointer", padding: 0 }}>sign out</button>
            </form>
            <Link href="/me" className="lift" style={primary}>your tile</Link>
          </>
        ) : (
          <>
            <Link href="/me" style={navLink}>sign in</Link>
            <Link href="/claim" className="lift" style={primary}>claim a tile</Link>
          </>
        )}
      </nav>
    </header>
  );
}
