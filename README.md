# ekam.ink - many hands, one canvas

One shared 24×24 canvas. 576 strangers each verify with their email, claim one tile, hand-paint it in the browser, and leave a one-line story. Zoomed out it reads as a single collective artwork; zoomed in, every square is one person's hand. When the canvas closes, the wall reveals itself as one seamless piece with a credits reel of every artist, downloadable by everyone who made it.

**Live:** [ekam.ink](https://ekam.ink) · **Figma file:** [design system + every screen](https://www.figma.com/design/WG9t3xscFniQ7VVHAs2zAF) · **ekam** is Sanskrit for *one*.

---

## Built for the Config Makeathon 2026

This is an entry for the Config Makeathon (Figma × Contra): *use Figma's suite to design and build something with purpose.* The purpose here is small and human — give hundreds of strangers one square each and watch them make a single thing together.

**The workflow, end to end:**

1. **Figma** — design tokens, the full type ramp, and every component and screen live in [one Figma file](https://www.figma.com/design/WG9t3xscFniQ7VVHAs2zAF): three variable collections with scopes and `var(--…)` code syntax, components with variants (buttons, panels, the dock, the music player, all six review states), and faithful screens from landing to finale.
2. **Figma MCP** — the bridge. The production CSS variables and the Figma variables mirror each other 1:1, and the Figma file itself was *built programmatically through the MCP* by Claude Code — the same agent that wrote the app. Design and code never drifted because the same hands held both.
3. **Claude Code → production** — Next.js 16 + Supabase on Vercel, shipped in small probe-verified increments (more on that below).
4. **Claude API in the product** — not just as a build tool: every submitted tile is reviewed by a vision model in seconds (see *The AI moderator*).

The canvas deadline is aligned to the makeathon's own submission cutoff, so the finale reveal happens live on the site during judging week.

---

## The loop

1. **Claim** — tap any open tile, verify your email with an 8-digit code. No password, no account, no app. One tile per person.
2. **Paint** — a real studio on a 1024px square: brushes, shapes, fills, custom colours, zoom, undo, and autosaving drafts that follow you across devices.
3. **Review** — an AI moderator screens the tile in seconds; the artist watches the verdict land live and can always request a human.
4. **The wall** — approved tiles appear for everyone in about a second. Visitors upvote tiles they love; the most loved tile wears a golden frame on the wall itself.
5. **Finale** — at the deadline: confetti, the seamless artwork (blank tiles as paper), a scrolling credits reel of every artist, and a one-click 9216×9216 PNG stitched entirely in the browser.

---

## Decisions that shaped it

- **One tile per verified email.** Scarcity is the point — your square is *yours*. Email OTP keeps the floor low (no accounts) while keeping people accountable.
- **No style curation, full colour.** An early 10-colour constraint was dropped on a working artist's advice. The prompt is soft ("say what's in your mind"); the wall's character comes from honesty, not curation.
- **Pressure-free claiming, with a fairness clock.** Claims originally never expired. When deadlines arrived, the rule became: 48 hours to submit, but **every submission resets your clock** — you can only lose a tile by going silent, never by trying and being returned. The countdown is shown only to the tile's owner, never as public pressure.
- **A rejection never takes your tile.** Moderation returns art to the artist; the tile stays theirs. Only silence (expiry) or the moderator's explicit *remove* reopens a square.
- **Auto-publish, with humans above the machine.** Waiting hours for a human kills the magic of "my art is on the wall". The AI publishes good-faith art in seconds — but anything uncertain degrades to human review, never to auto-live.
- **The chrome is near-monochrome.** Warm dark editorial system (Spectral / Inter / IBM Plex Mono, one ember accent) so the only colour on screen is what the artists painted.
- **Privacy is structural.** Artist emails never leave the server: public reads go through a `public_tiles` view that nulls everything unpublished, and base tables have no public RLS policies.
- **The reveal happens at the deadline, full or not.** Blanks render as paper — paintings on one cream canvas — so an unfinished wall still reads as a finished artwork.

---

## The AI moderator

The hardest product problem: strangers + anonymity + a public wall = someone will draw something awful, in any language, hidden in a corner. A human-only queue was too slow for the live magic; naive AI moderation was too easy to fool. What shipped, after adversarial testing:

- **Two passes, both must clear.** Pass one (Claude Opus 4.8, structured JSON output) does a methodical sweep: enumerate every element including corners and small marks, transcribe **all** text in any script, then judge. Every "approve" then faces a second, independent adversarial pass whose only job is hunting hidden or disguised content. Disagreement → human queue.
- **Multilingual by scar tissue.** A test tile reading "Mickey lund" (Hindi profanity in Latin script) sailed through v1. The prompt now treats transliteration as a first-class threat, and a Romanized-Hindi/Urdu wordlist backstop caps any text hit at human review regardless of what the model concluded.
- **Race-proof.** A screening lock stops double-runs; a supersede guard re-checks the image path and verdict before acting, so a stale verdict can never publish or reject a tile the artist already resubmitted (filenames are timestamped, so "same tile, new art" is always detectable).
- **Fail-soft.** No API key, an outage, a parse error — every failure path lands in the human moderation queue, never in auto-publish.
- **The artist sees it live.** Submit → "Reviewing your tile…" → the panel resolves into *live* (confetti), *returned* (with the reason, plus "Draw something new" or "Request a human review"), or *needs a human look*. Decisions also arrive in an in-app notification bell.
- **Everything is logged.** Every approve, reject, return, expiry, and screen lands in an admin-visible moderation log with reasons.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19, TypeScript, Turbopack) |
| Hosting | Vercel (auto-deploy from `main`) |
| Data | Supabase Postgres — tiles, votes, notifications, moderation log |
| Files | Supabase Storage — tile PNGs + 192px thumbnails |
| Auth | Supabase email OTP, custom SMTP via Resend (`hello@ekam.ink`) |
| Realtime | Supabase Realtime broadcast — every open canvas refreshes in ~1s |
| AI | Claude API, `claude-opus-4-8`, vision + structured outputs |
| Design | Figma (tokens/components/screens), built + synced via the Figma MCP |
| Canvas | Hand-rolled: inset-aware pan/zoom composite (adaptive 64/128px per tile), thumbnail pipeline, client-side stitcher |

Server actions (no user-facing API routes) with concurrency-safe writes — claiming a tile is an `UPDATE … WHERE status = 'open'` that simply finds zero rows if someone beat you to it.

---

## Hard problems, and how they fell

**Headless screenshots lie about mobile.** Early "mobile bugs" turned out to be phantoms of raw `chrome --headless --screenshot`, which doesn't emulate a real viewport. The fix became methodology: every change is verified with a real device-emulation probe (puppeteer driving system Chrome with touch + DPR), and every deploy is confirmed by polling production for a marker from the new build. Nothing ships on "looks right locally".

**The music player that kept dying.** A lofi radio that survives route changes met every WebAudio failure mode: volume dead because `element.volume` is ignored once routed through WebAudio (→ GainNode); silence after tab-idle because the AudioContext suspends (→ resume listeners); silence that survives even *that* because the media element's renderer dies after long idle — detectable only by watching for a frozen `currentTime` (→ rebuild the element through a fresh pipeline); and stale output devices after AirPods switches (→ rebuild on `devicechange`). Each layer was behaviourally verified by monkeypatching the audio clock.

**z-index can't save you from fixed-position stacking contexts.** The floating player kept winning against panels regardless of z-index, because each `position:fixed` root is its own stacking context. The fix is a body attribute (`body[data-panel]`) that hides the player's UI while any panel, celebration, or the finale is up — audio keeps playing.

**The dot-test race.** Submitting a trivial tile showed "needs a human review" *and* "approved" simultaneously: the status endpoint read the stored verdict during the 1–3 second publish window. Approve-in-flight now reports as "still checking", and the supersede guard ensures a stale run can never act on a resubmitted image.

**The hidden-content test.** A house scene with a small obscene doodle in the corner passed v2 moderation. That failure created the two-pass design: enumerate-everything-first (so small marks can't be "overall harmless"-averaged away) plus an independent second reviewer hunting exactly this.

**Real 404s in a streaming world.** With route-level loading screens, Next streams a 200 before the page can decide a tile doesn't exist — so garbage share-links soft-404'd. Solved in `proxy.ts` (Next 16's renamed middleware): malformed IDs are rewritten to the global not-found page with a true 404 status before rendering starts.

**A 9216×9216 export, in the browser, that never taints.** The finale download stitches 576 PNGs client-side: 12-way concurrent loads with `crossOrigin="anonymous"` end to end (one tainted draw and `toBlob` throws), blanks painted as paper, progress reported per tile. Print-resolution stitching stays an offline job by design.

---

## Running it

```bash
cd web
npm install
npm run dev
```

`web/.env.local` (names only — never committed):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=        # AI moderation (optional: fails soft to the human queue)
ADMIN_PASSWORD=           # /admin passphrase
CRON_SECRET=              # optional, guards the cron route
```

Migrations live in `supabase/migrations/` (run in order in the Supabase SQL editor). The deeper engineering log — every decision with its *why*, and every bug with its autopsy — is in [`HANDOFF.md`](./HANDOFF.md).

---

## Rights & credits

© 2026 Premaansh Vyas. The source is public to read and evaluate; it is **not** licensed for reuse, redistribution, or derivative works without permission. The **tile artworks belong to the artists who painted them** (publishing on ekam.ink grants display rights, nothing more). The lofi tracks in `web/public/audio/` are **Pixabay** content under [Pixabay's content license](https://pixabay.com/service/license-summary/).

Made by [Premaansh Vyas](https://github.com/PremaanshVyas) — premaanshvyas04@gmail.com · Type: Spectral, Inter, IBM Plex Mono · Built with Figma, the Figma MCP, Claude Code, and the Claude API.
