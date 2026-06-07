"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      style={{
        minHeight: "80vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 14, padding: 24,
        textAlign: "center", fontFamily: "var(--font-ui), sans-serif",
      }}
    >
      <div style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 30, color: "var(--color-text-primary)" }}>
        ekam.ink
      </div>
      <p style={{ color: "var(--color-text-secondary)", margin: 0, maxWidth: 440 }}>
        something hiccuped loading the canvas.
      </p>
      <pre
        style={{
          fontSize: 12, color: "var(--color-text-muted)", whiteSpace: "pre-wrap",
          wordBreak: "break-word", maxWidth: "90vw", margin: 0,
          background: "var(--color-bg-surface)", border: "1px solid var(--color-border-default)",
          borderRadius: 8, padding: "10px 12px",
        }}
      >
        {String(error?.message || error)}{error?.digest ? `\n(digest: ${error.digest})` : ""}
      </pre>
      <button
        onClick={() => reset()}
        style={{
          fontFamily: "var(--font-ui), sans-serif", fontSize: 15, fontWeight: 500,
          color: "var(--color-text-inverse)", background: "var(--palette-ink)",
          border: "none", borderRadius: 9999, padding: "10px 22px", cursor: "pointer",
        }}
      >
        try again
      </button>
    </div>
  );
}
