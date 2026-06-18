# Finale Email — Design & Build Plan

_Status: **DESIGNED, NOT BUILT. Deferred to Canvas Nº 002.**_
_Decision: Mickey, 2026-06-18; reaffirmed 2026-06-19. See `HANDOFF.md` §10._

When a canvas reveals (its deadline closes / it fills), send a single, thoughtful email with the
finished artwork to a list of people who opted in. One-way "your canvas is done" moment — not a
newsletter, not a drip. This doc is the complete plan so it can be built fast for Nº 002.

---

## 1. Why it's deferred (not cancelled)

- **The payoff needs a full(ish) canvas.** The finale email's whole emotional hook is _"look at this
  beautiful thing hundreds of strangers made."_ Nº 001 sat at ~2% (about a dozen tiles) and closed
  21 June 2026 — a finale send there would land on near-blank paper and undersell the idea.
- **Low traffic = empty list.** Collecting during Nº 001's quiet window would capture almost nobody.
- **Not worth fresh send infra mid-judging.** Net-new email plumbing during the makeathon judging
  week is risk with no makeathon upside (judges don't verify a waitlist).

→ Build the **collection AND the send together for Canvas Nº 002**, when there's a real audience and
a canvas worth showing off. The design below is locked, so it'll move fast.

## 2. Sender — the one real dependency (already 90% there)

The platform does **not** send arbitrary transactional email from app code today. `notify()` only
writes the in-app bell (`notifications` table). The only real emails are Supabase **Auth OTP** codes
(tile-email recovery), sent via **Resend custom SMTP** configured inside Supabase Auth.

**Good news:** the **Resend account exists and `ekam.ink` is already domain-verified** (that's how
the Auth SMTP sends from `hello@ekam.ink`). So the finale send does **not** need a new provider, a
new account, or a domain-verification wait. It needs:

1. A **`RESEND_API_KEY`** added to Vercel env (generate it in the existing Resend dashboard).
2. App code that calls the **Resend API directly** (`POST https://api.resend.com/emails`, or the
   `resend` npm SDK) — separate from the Supabase Auth SMTP path, which is auth-only.
3. Send from a verified address, e.g. `hello@ekam.ink` or `canvas@ekam.ink`.

Resend free tier ≈ 3k emails/month / 100/day — fine for a single finale blast; bump if a list grows.

## 3. The artwork in the email

- The wall is stitched **client-side** in `lib/stitch.ts` (published art + paper blanks, `crossOrigin`
  so export never taints; 384px/tile → **9216²**). The admin "the artwork" tab already previews +
  downloads this.
- **Never email the 9216² file.** Generate a **web-friendly ~1500px** JPG/PNG, upload it to Supabase
  storage, and embed/link that; link "view full resolution" to the big one. Generating the web
  version can reuse the stitch pipeline at a smaller `px/tile`.

## 4. Data model — one new table

Keep this **completely separate** from `tiles.artist_email` (tile ownership / recovery). Opting into
the finale list must never touch a tile's email, and vice-versa.

```sql
create table finale_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,                       -- store lowercased; UNIQUE = dedup key
  source text not null,                      -- 'participant' | 'anon-painter' | 'browser'
  canvas_id uuid references canvases(id),    -- which edition they signed up under
  unsub_token uuid not null default gen_random_uuid(),
  created_at timestamptz default now(),
  unique (lower(email))                       -- or a unique index on lower(email)
);
```

- **Subscribe = upsert on lowercased email** (`on conflict do nothing`/update `source` if "better").
  So all touchpoints are idempotent and can never duplicate a person.
- RLS: no public select. Inserts go through a server action (service role) with format + rate checks.

## 5. Three collection touchpoints (all → the same upsert)

No verification anywhere — this is a one-way notification, so a real-format check is enough (a typo'd
address just doesn't get the one email; low blast radius for a single send).

1. **Painted + already has a verified email on file** → a one-tap **Yes/No** at the post-submit
   moment ("Want the finished canvas emailed to you when it's done?"). No typing.
2. **Painted, no email** → a small email box at that same post-submit moment. **No code/verification.**
3. **Just browsing** (homepage / `/canvas`) → a small email box ("Get the finished artwork in your
   inbox when it's done"). **No code.**

Each posts to `subscribeFinale(email, source)` → upsert. Light per-IP/session rate-limit + format
check on the two unverified boxes.

## 6. The send

- **Manual admin button** — an "Send the finale email" action in `/admin`, fired at reveal. Manual
  for control + safety (preview the artwork, confirm the list, one deliberate blast). **Not**
  auto-on-close.
- Body: the ~1500px artwork, a warm one-liner, the canvas stats, "view full resolution" + share
  links, and a **one-click unsubscribe** (uses `unsub_token`; honor it for any future sends).
- Copy promises **"one email only"** — and we keep that promise for the edition.

## 7. Get-right checklist

- Opt-in only; **one-click unsubscribe** in every send (token route, no login).
- "One email only" copy, and mean it.
- Format check + light rate-limit on the unverified boxes.
- Web-res artwork in email, full-res by link (never the 9216² inline).
- List is **per edition** (`canvas_id`) so Nº 002's send doesn't spam Nº 001's people unasked.

## 8. Open questions for Mickey (were unanswered at defer time)

- Homepage box: show to **everyone**, or only people **without** a tile?
- Send trigger: confirm **manual admin** (recommended) vs auto-on-reveal.
- One global list vs strictly per-edition lists (plan assumes per-edition via `canvas_id`).

## 9. Build order when greenlit (≈ half a day)

1. Migration: `finale_subscribers` (above) + RLS.
2. `subscribeFinale` server action (upsert + format/rate checks) + the 3 touchpoint UIs.
3. `RESEND_API_KEY` in env + a `lib/email.ts` Resend wrapper + the unsubscribe route.
4. Web-res artwork generator (smaller `px/tile` through the stitch pipeline → storage).
5. Admin "Send the finale email" button (preview → confirm → send → mark sent).

_Related: `HANDOFF.md` (§2 anon identity = the DIFFERENT optional tile email at submit), and the
deferred-feature memory note. The submit-time tile email and this finale list are separate systems._
