# ekam.ink — many hands, one canvas

One shared 24×24 canvas. 576 strangers each verify with their email, claim one tile, hand-paint it in the browser, and leave a one-line story. Zoom out and it reads as a single collective artwork; zoom in and every square is one person's hand. When the canvas closes, the wall reveals itself as one seamless piece, downloadable by everyone who made it.

**Live:** https://ekam.ink · Built for the Config Makeathon 2026 (Figma × Contra).

## How it works

1. **Claim** — tap any open tile, verify your email with an 8-digit code (no password, no account). One tile per person, 48 hours to paint it; the clock resets every time you submit, and silent claims reopen automatically.
2. **Paint** — a full painting studio on a 1024px tile: brushes, shapes, fills, zoom, undo, custom colours, autosaving drafts that follow you across devices.
3. **Review** — every submission is screened by Claude (vision) within seconds: one pass enumerates and transcribes everything on the tile in any language or script, a second adversarial pass hunts hidden content, and anything uncertain lands in a human moderation queue instead of auto-publishing. Artists watch the verdict live and can request a human review.
4. **Live wall** — approved tiles join the canvas in about a second for everyone (Supabase Realtime). Signed-in visitors can upvote tiles; the most loved tile wears a golden frame on the wall itself.
5. **Finale** — at the deadline the celebration fires: confetti, the seamless artwork with paper blanks, a scrolling credits reel of every artist, and a one-click 9216×9216 PNG download stitched in the browser.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript, Turbopack) on **Vercel**
- **Supabase** — Postgres (tiles, votes, notifications, moderation log), Storage (tile PNGs + thumbnails), email-OTP auth, Realtime broadcast
- **Claude API** (`claude-opus-4-8`) — two-pass image moderation with structured outputs
- **Resend** — transactional email (custom SMTP for the OTP codes)
- **Figma** — the design system and every screen live in a Figma file, built and kept in sync through the Figma MCP; the production UI was generated from it with Claude Code
- Canvas rendering is hand-rolled: an inset-aware pan/zoom composite (adaptive 64/128px per tile), a thumbnail pipeline, and a client-side stitcher for the final artwork

## Architecture notes

- `web/` is the app. Server actions handle claim/submit/vote with concurrency-safe updates (`.eq("status","open")` style guards) — no API routes for user flows.
- Moderation (`web/lib/moderate.ts`) runs post-response via `after()`: screening lock, supersede guard (a stale verdict can never act on a resubmitted image), wordlist backstop, and fail-soft to the human queue if the API is unavailable.
- Public reads go through a `public_tiles` view that nulls everything on unpublished rows; artist emails never leave the server (RLS with no public policies on base tables).
- The 48h claim windows and the canvas deadline are enforced by a lazy sweep on page loads plus a daily cron backstop, with every write falling back gracefully if a migration hasn't run yet.
- Deep dive: [`HANDOFF.md`](./HANDOFF.md) — the full decision log, including every bug that bit us and why things are the way they are.

## Running it

```bash
cd web
npm install
npm run dev
```

Environment (`web/.env.local`, never committed):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=        # AI moderation (optional: fails soft to manual review)
ADMIN_PASSWORD=           # /admin passphrase
CRON_SECRET=              # optional, guards the cron route
```

Database schema lives in `supabase/migrations/` (run in order in the Supabase SQL editor).

## Credits

Made by [Premaansh Vyas](https://github.com/PremaanshVyas) — premaanshvyas04@gmail.com.
Lofi tracks self-hosted from Pixabay (free for commercial use). Type: Spectral, Inter, IBM Plex Mono.
