# ekam.ink

A collective tile-canvas artwork for the **Config Makeathon** (Figma × Contra). One shared 24×24 canvas; strangers each claim **one tile**, hand-paint *what home looks like*, and leave one line. Zoom out → a single collective artwork. Zoom in → individual paintings, each with a name and a story. Hover → the tile whispers.

> **r/place was a battlefield. This is a quilt.**

---

## Status (live build ledger: `.figma-ds-state.json`)

**Live app:** https://ekam.ink

**Figma file** (design system + screens, → Figma Community on Day 10):
https://www.figma.com/design/7TpgTn27dDmmig7T5hzhs3

- ✅ **Design system** — 4 variable collections / 66 variables (10-color painting palette · warm neutral ramp · spacing · radius · type), 9 text styles (Inter + Shantell Sans), 2 effect styles — all scoped + `var(--…)` code syntax. Rendered Foundations page.
- ✅ **Components** — `Tile` (Open/Claimed/Published) · `Story Card` · `Hover Whisper`
- ✅ **Screens** — Canvas view in 3 fill-states (5/40/90%) · Claim modal · Painter · Admin moderation queue
- ✅ **Cover** + **OG/social** 1200×630 card
- ✅ **Code bridge** — `styles/tokens.css`, `supabase/schema.sql`
- ✅ **Phase B app — wired to live Supabase.** Next.js 16 + React 19 + Tailwind v4 in `web/`. **Full loop verified:** claim → paint (HTML5 canvas) → submit (image → Storage, status `pending`) → `/admin` approve/reject → published tile renders on the homepage canvas (pan/zoom · hover whisper · click→story card). DB seeded: 576 tiles + 10 founding tiles. Run: `cd web && npm run dev`.
- ⬜ Deploy to Vercel (#7) · Figma Make v0 · claim-expiry cron (reopen after 24h) · video · submission

Setup done: Figma Pro ✓ · Weave ✓ · Figma MCP connected+verified ✓.

## Repo

| Path | What |
|---|---|
| `web/` | The Next.js 16 app (App Router · TS · Tailwind v4) wired to Supabase. |
| `.figma-ds-state.json` | Live ledger of the Figma MCP build (token plan, node IDs, progress). |
| `styles/tokens.css` | Design tokens as CSS vars — names match Figma Dev Mode 1:1 (pixel-honest handoff). |
| `supabase/schema.sql` | DB schema (§5) + hardened RLS (`public_tiles` view keeps `artist_email` private). |
| `social/day1-announcement.md` | Ready-to-post Day-1 announcement copy (X / IG / LinkedIn). |

> `CLAUDE_MASTER_BRIEF.md` (the full private playbook) is kept **local and gitignored** — it contains business strategy not meant for public repos.

## Architecture (two-phase hybrid — this IS the Innovative-Workflow story)

- **Phase A** — Figma Design system → **Figma Make** generates a v0 with Supabase wired in.
- **Phase B** — **Next.js 16 + TS + Tailwind**, built in Claude Code with **Figma MCP** feeding designs. Supabase (Postgres · Storage · edge functions · RLS). Deploy on Vercel.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Supabase · HTML5 `<canvas>` (512×512 painter) · CSS-transform pan/zoom.

## Run locally

```bash
cd web
cp .env.local.example .env.local        # then fill in your Supabase URL + keys
npm install
node --env-file=.env.local scripts/seed.mjs   # one-time: seed canvas + 576 tiles
npm run dev                                     # http://localhost:3000
```

Routes: `/` (canvas · pan/zoom · hover whisper · click→story) · `/claim` → `/paint` (painter) · `/admin` (moderation).

## Deploy (Vercel)

Import this repo → set **Root Directory = `web`** → add the three env vars from your `.env.local` → Deploy.
Still TODO: a claim-expiry cron (reopen tiles whose 24h lapsed) via Vercel Cron or Supabase scheduled function.

## Compliance guardrails (from the brief)

- Everything must stay demonstrably **made with Figma's suite**.
- **No image/video uploads** — hand-painted tiles only.
- **Nothing auto-publishes** — hard moderation gate, queue checked 3×/day once live.
- Never mention the business layer (Edition 0 / prints / charity) in public materials.
- 🎥 Start a screen recording before every Make / MCP / Weave session.
