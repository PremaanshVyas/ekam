# ekam.ink — Engineering Handoff & Decision Log

_Read this first. It's the full technical context: what the thing is, how it's built, every
non-obvious decision + **why**, the bugs that bit us + how they were fixed, conventions, and
how to do common tasks. Competition strategy/prize angles live in the gitignored
`CLAUDE_MASTER_BRIEF.md`._

**As of:** 2026-06-09 · **Live:** https://ekam.ink · **Repo:** github.com/PremaanshVyas/ekam (app in `web/`)

---

## 1. What it is
A collective **24×24 = 576-tile canvas** for the Config Makeathon (Figma × Contra). A stranger
signs in with their email, **claims one tile**, **hand-paints** it, and leaves a one-line story.
Zoom out → a single collective artwork ("the quilt"); zoom in → individual paintings; hover →
the tile whispers its story; click → a tile-detail panel. Theme/invitation: **"what home looks
like"** (prompt: _"where were you when home looked like this?"_) — kept as a *soft* prompt, not an
enforced constraint (see decision #5). Built by **Mickey** (premaanshvyas04@gmail.com), brand **ekam.ink**.

## 2. Status (everything below is LIVE and working)
Full loop: **email magic-code sign-in → claim (yours, no deadline) → paint (full colour + tools)
→ submit → moderation queue → /admin approve → published on canvas.** Plus: edit your tile anytime,
/me dashboard, admin (queue + painted tabs, painter emails, one-click remove), draggable lofi
music player with visualizer, editorial-gallery design, mobile-fixed, a11y, OG image, error
boundaries, custom domain + SSL. **Pre-launch QA in progress (target June 11), then soft-launch +
daily build-in-public posts.**

## 3. Stack
- **Next.js 16** (App Router, React 19, TypeScript, Tailwind v4 — but styling is almost all
  **inline styles referencing CSS variables**, not Tailwind classes). ⚠️ `web/AGENTS.md` warns Next 16
  has breaking changes vs training data — check `node_modules/next/dist/docs/` if unsure.
- **Supabase**: Postgres + Storage (tile PNGs + the audio files are in `public/`, not Storage) + Auth (magic-code OTP).
- **Vercel**: auto-deploys from GitHub `main`. Custom domain ekam.ink.
- **Resend**: transactional email (magic codes) via custom SMTP in Supabase Auth; sender `hello@ekam.ink`.
- **Figma** design system + screens (fileKey `7TpgTn27dDmmig7T5hzhs3`) built via the Figma MCP.

## 4. Key files (in `web/`)
- `app/page.tsx` — homepage: SiteHeader + editorial hero + Live counter + `<Explorer>` + footer. Server component, `force-dynamic`, reads auth + tiles.
- `components/Explorer.tsx` — 3-col explorer (left rail · `<Canvas>` · right tile-detail panel). Client; holds selected-tile state.
- `components/Canvas.tsx` — the `<canvas>` quilt: draw loop, pan/zoom, hover whisper, stitch-in + completion-seal animations, empty-tile hover, `onSelect` callback. **Painted tiles are `image_path` PNGs in Supabase Storage; founders are hex colours.**
- `components/Painter.tsx` — the painter: **full colour picker** (presets + `<input type=color>`), tools (brush 4 sizes / fill flood-bucket / fill-tile / eraser / undo / clear), pre-loads existing art when editing, story phase, submit.
- `components/SiteHeader.tsx` — shared header (wordmark + nav + sign-in/email/sign-out). Used on every page.
- `components/MusicPlayer.tsx` — floating draggable/minimizable player; reads `public/audio/playlist.json`; Web Audio visualizer; mounted in `app/layout.tsx` so it persists across navigation.
- `components/LivePoll.tsx` — soft-refreshes the homepage every 12s + on tab focus (live counter/canvas) via `router.refresh()`.
- `components/SignIn.tsx` — magic-code form (`signInWithOtp` → `verifyOtp`).
- `app/me/page.tsx` — **dashboard**: signed-out → SignIn; no tile → "make your first mark"; has tile → submission + status badge + edit.
- `app/claim/{page,actions}.tsx` — claim flow. `claimTile` action. Has-tile owners redirect to `/me`.
- `app/paint/{page,actions}.tsx` — painter page (finds tile by email via `findMyTile`) + `submitTile` action.
- `app/admin/{page,actions}.tsx` — moderation (queue + painted tabs); `approve`/`reject`/`removeTile`.
- `app/actions.ts` — `signOut`. `app/error.tsx` + `app/global-error.tsx` — error boundaries (show the error message). `app/opengraph-image.tsx` + `twitter-image.tsx` — generated OG card.
- `lib/tiles.ts` — `findMyTile` (migration-tolerant tile lookup by email) + `tileImageUrl`.
- `lib/supabase.ts` — `supabaseAnon()`, `supabaseAdmin()`, `CANVAS_SLUG = "what-home-looks-like"` (slug unchanged despite rename).
- `lib/auth-server.ts` / `auth-browser.ts` — @supabase/ssr clients. `lib/admin-auth.ts` — admin gate (sha256 of ADMIN_PASSWORD cookie). `lib/expiry.ts` — now unused (claims don't expire).
- `app/globals.css` — **all design tokens** (CSS vars) + `.serif`/`.overline` helpers + animations (`fade-up`, `pulse`, `rise-panel`, `lift`) + `:focus-visible` ring + `.explorer` responsive grid.
- `scripts/reset-tiles.mjs` — reset tiles for testing. `scripts/seed.mjs` — seed canvas + tiles.
- `public/audio/` — 20 lofi MP3s (Pixabay) + `playlist.json` + `README.md`.
- `supabase/schema.sql` + `migrations/0002` (published-only `public_tiles` view) + `migrations/0003` (pending_* columns + drop claim expiry). **0002 + 0003 are RUN.**

## 5. Key decisions & WHY
1. **Editorial-gallery design (current).** Display = **Fraunces** (high-contrast serif, Canela/Tiempos register); UI = **Inter**; palette = **warm cream** ("stone" ramp, but it's cream); the **artwork owns all colour**, chrome is quiet. Framed like an exhibition catalogue ("Canvas Nº 001", named canvas, live tile count, tile-detail panel). _Why:_ Mickey's old "MOSAIC" mockup looked far better than the earlier looks; this is a deliberate pivot from (a) the original warm-diary/handwriting look and (b) a brief modern-grotesk (Space Grotesk + cool stone) phase. Both earlier looks are gone.
2. **Canvas renders distinct, separated tiles while filling → stitches seamless at 100%.** _Why:_ Mickey wanted to *see* the tiles/grid (distinct cards with gaps + borders), not graph-paper lines and not an always-seamless blur. The 100% seal is the "completion reveal" moment.
3. **Full colour freedom + simple tools; the 10-colour palette constraint was DROPPED.** _Why:_ Mickey's sister (a working artist) advised no constraints — let people make anything. Painter has a full colour picker + brush/fill-bucket/fill-tile/eraser. White canvas.
4. **"what home looks like" kept as a *soft* prompt, not enforced.** _Why:_ Mickey said keep it for now (it's the project's identity + all the taglines/framing), "we'll eventually replace it with some other thing." If asked to go fully themeless later, that's a bigger rebrand (taglines, prompt, hero copy).
5. **No 24h claim expiry — claims persist for many days.** _Why:_ the canvas should fill over many days, not pressure people in 24h. Removed the countdown + the auto-reopen cron. (`lib/expiry.ts` + `api/cron/reopen` are vestigial.)
6. **Tiles are editable anytime.** Editing a *pending/claimed* tile overwrites it. Editing an *already-published* tile stores the new version in `pending_image_path`/`pending_story` (migration 0003) so the **live tile stays on the canvas** until you re-approve. Admin shows these as "edit · live tile". _Why:_ Mickey wanted edits without taking a tile off the canvas during re-review.
7. **Tiles are keyed to the artist's email**, found via `findMyTile` — so a person can return on any device and edit. `/me` is the dashboard.
8. **Music: 20 self-hosted Pixabay lofi tracks** (free for commercial, no attribution) in `public/audio/`, configured by `playlist.json`. _Why:_ SomaFM streams couldn't be verified from the sandbox + Pixabay self-host = bulletproof licensing + reliable playback. Player has a Web Audio **multi-colour visualizer** (ekam tile palette as a rainbow), scrub bar, auto-next, draggable, minimizable, persists across pages.
9. **Submit as a LIVING canvas** for the competition (it won't be 100% by June 18; the evolving piece is the better story). A **stitched high-res PNG export** is planned for the video (NOT built yet).
10. **Domain: `ekam.ink` (apex) is PRIMARY** (serves directly); `www` 308-redirects to it. **Do not reshuffle this in Vercel** (flipping primary caused a cached-308 redirect loop on phones). Certs auto-renew (Let's Encrypt via Vercel).

## 6. Gotchas / bugs fixed (don't re-introduce these)
- **Mobile "page couldn't load" = a JS crash:** `onMove` read `pan.current.tx` inside a deferred `setView` updater; a quick tap nulled `pan.current` first → `null.tx`. **Fix:** capture `const p = pan.current` before the updater. (Desktop never hit it because you hold the mouse button through a drag.)
- **Editing a tile showed the OLD image:** re-uploading to the same path (`{tileId}.png`) → browser/CDN served the cached copy. **Fix:** versioned filenames per submit (`{tileId}-{timestamp}.png`).
- **`/paint` said "you haven't claimed a tile" + looped with `/claim`:** the query selected `pending_*` columns (errored pre-migration) and `/claim`↔`/paint` redirected each other. **Fix:** migration-tolerant `findMyTile` (falls back to safe columns) + `/claim` (has-tile) → `/me` + the `/me` dashboard.
- **Mobile cert "not secure" / "couldn't load":** was the freshly-provisioned cert + the apex/www config + a cached-308 loop after flipping the primary domain. **Resolved** by apex-primary + incognito/clear-cache. Certs are valid + auto-renew. **Don't touch the Vercel domain config.**
- **Mobile canvas overflow:** needed the **viewport meta** (`width=device-width`, in `app/layout.tsx` `export const viewport`) + responsive widths. The headless-Chrome screenshot tool is **NOT a faithful mobile emulator** (it renders at a desktop-ish width and misled debugging) — verify mobile on a real device.
- **Local builds served stale output** (identical screenshots across changes): the `.next` cache + a stale `next start` on :3000. **Fix:** `rm -rf .next` before a verification build; serve on a fresh port (`npx next start -p 3100`); `pkill -f next-server` first.
- **`curl https://ekam.ink` returns a redirect stub** (apex → www was the old config). Always use **`curl -sL`** (follow redirects) when checking the live HTML.
- **OG image fonts:** `fetch(new URL('./font.ttf', import.meta.url))` fails at prerender in this Next build. **Fix:** fetch fonts from the **jsDelivr CDN** (`cdn.jsdelivr.net/fontsource/...`) with a try/catch fallback to the default font.
- **Figma file rename via API is unsupported** (`figma.root.name` throws). Rename the file in the Figma UI manually.
- **Web Audio:** `createMediaElementSource` can be called **once per element**; you **must** connect the analyser → `destination` or audio mutes; `AudioContext` must be `resume()`d after a user gesture.
- **`NEXT_REDIRECT`** thrown by `redirect()` in a server action gets swallowed by try/catch — for the painter submit we `return {ok}` and set client state instead of redirecting.

## 7. Conventions
- **Design tokens** are CSS vars in `globals.css :root`: `--palette-*` (the 10 painting colours, unchanged), `--stone-*` (the warm-cream chrome ramp — name says "stone" but values are cream), semantic `--color-*`, `--font-display` (Fraunces), `--font-ui` (Inter). Components use inline `style={{ ... var(--…) }}`.
- Serif: `className="serif"` (adds optical sizing) or `fontFamily: "var(--font-display), Georgia, serif"`. UI: `var(--font-ui), sans-serif`.
- Buttons: small radius (4–6px) + ghost/primary; pills for chips. Lowercase-warm microcopy.
- **Figma mirror:** the Figma "Primitives" `warm/*` variables hold the **cream** values; `family/display` = Fraunces; the `Display/Prompt`, `Whisper`, `Counter` text styles = Fraunces. (Code uses `--stone-*` names, Figma uses `warm/*` names — different names, same values.)
- Always **build + commit + push** each change (Vercel auto-deploys). Commit footer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## 8. Common tasks
- **Reset tiles (testing):** `cd web && node --env-file=.env.local scripts/reset-tiles.mjs` (all) or `… scripts/reset-tiles.mjs a@x.com` (by email). Or `/admin → painted tiles → remove` (one click, shows the email).
- **Moderate:** `/admin` (password = `ADMIN_PASSWORD` in `web/.env.local`). Queue tab = pending + edits; Painted tab = live tiles + remove.
- **Add/curate music:** drop an MP3 in `web/public/audio/`, add a line to `playlist.json` (`{title, artist, src:"/audio/file.mp3"}`), push.
- **Deploy:** push to `main`. Verify live with `curl -sL https://ekam.ink/...`.
- **Verify/screenshot a build locally:** `cd web && rm -rf .next && npm run build && npx next start -p 3100`, then headless Chrome `--screenshot`, then `sips -Z 1400 in.png --out small.png` (Read needs <2000px). **Headless ≠ real mobile.**
- **Figma:** load the `figma-use` skill, use the `use_figma` MCP tool, fileKey `7TpgTn27dDmmig7T5hzhs3`.

## 9. Infra (keys are in `web/.env.local`, gitignored — never commit them)
- **Supabase** ref `yhuvfkwghnmixypbchlx`. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`. Schema + migrations in `supabase/`. Public reads go through the **`public_tiles` view (published-only)** — no unapproved content leaks.
- **Vercel:** GitHub `PremaanshVyas/ekam` → `main` auto-deploy → `ekam.ink` (apex primary, www→apex). No cron anymore.
- **Resend:** domain ekam.ink verified; custom SMTP set in Supabase Auth; email templates use `{{ .Token }}` (code, not link). Free tier ≈ 100 emails/day — bump if a post goes viral.

## 10. What's left
**Competition / launch (human-led, ~June 11 onward):**
- Record the **video** (2:30 + 0:30) — scored category; script in the brief.
- **Publish the Figma file to Community** (+5 bonus).
- **Submit on Contra** (live link + community/working file + video).
- **Social posts** daily (#ConfigMakeathon @figma) — build-in-public.
- **Recruit real painters** / soft-launch so the canvas has real art for the demo/timelapse.

**Product (buildable):**
- **Stitched-canvas high-res PNG export** (for the video + a permanent artifact) — designed/agreed, not built.
- **Clean launch state** — reset test tiles; decide start-empty (recommended) vs seed a few disclosed founder tiles.

## 11. Working style with Mickey
Build **continuously**, don't stop for per-task confirmation; Mickey signals when to wrap. Ship every
change. Mickey reacts to the **live/visual** result — iterate from screenshots. Big subjective
choices (fonts, palette): make a strong opinionated version, show it, refine. Keep the
"what home looks like" phrasing as the soft prompt unless told to drop it.
