import Link from "next/link";
import Wordmark from "@/components/Wordmark";

// Horizontal lockup: the ensō mark + the wordmark. Links to home by default.
export default function Logo({ sm = false, link = true }: { sm?: boolean; link?: boolean }) {
  const inner = (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/ekam-mark.svg" alt="" aria-hidden="true" className={"ekam-logo__mark" + (sm ? " ekam-logo__mark--sm" : "")} />
      <Wordmark sm={sm} />
    </>
  );
  return link ? (
    <Link href="/" className="ekam-logo" aria-label="ekam.ink — home">{inner}</Link>
  ) : (
    <span className="ekam-logo">{inner}</span>
  );
}
