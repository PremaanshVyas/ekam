"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0, minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 14, padding: 24,
          textAlign: "center", background: "#F5F3ED", color: "#1A1916",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 style={{ fontSize: 28, margin: 0 }}>ekam.ink</h1>
        <p style={{ margin: 0, color: "#54514B" }}>something went wrong.</p>
        <pre style={{ fontSize: 12, color: "#827E74", whiteSpace: "pre-wrap", wordBreak: "break-word", maxWidth: "90vw", margin: 0 }}>
          {String(error?.message || error)}{error?.digest ? `\n(digest: ${error.digest})` : ""}
        </pre>
        <button
          onClick={() => reset()}
          style={{ fontSize: 15, fontWeight: 500, color: "#FBFAF7", background: "#20201D", border: "none", borderRadius: 9999, padding: "10px 22px", cursor: "pointer" }}
        >
          try again
        </button>
      </body>
    </html>
  );
}
