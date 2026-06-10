// ekam.ink wordmark — "ekam" + an ember square tile (the period) + "ink".
// Live text (Inter 600, lowercase, tracked), so it stays crisp, selectable, themeable.
export default function Wordmark({ sm = false, className = "" }: { sm?: boolean; className?: string }) {
  return (
    <span className={"ekam-wordmark" + (sm ? " ekam-wordmark--sm" : "") + (className ? " " + className : "")}>
      ekam<span className="ekam-wordmark__tile" />ink
    </span>
  );
}
