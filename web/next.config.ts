import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false, // hide the dev-mode badge (dev-only; no effect on production)
  poweredByHeader: false,
  // Submit/autosave send the painted tile as a base64 PNG dataURL inside a Server Action.
  // A 1024² PNG is commonly 1–3MB, but Server Actions default to a 1MB body limit, which
  // silently rejects real submissions with an opaque "Server Components render" error.
  // Raise it (kept under Vercel's serverless request-body ceiling); the studio also guards
  // the payload size client-side before sending.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        // brand assets + audio never change paths without changing content
        source: "/(brand|audio)/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
