# Anonymous identity — plan (one tile per device, no email in the path)

**Branch:** `anonymous-identity` · **Status:** plan, awaiting go-ahead + the Supabase toggle.
**Goal:** a click on an open tile goes straight to painting — no email, no code. Keep "one tile
per person" as a soft, invisible guarantee. Capture email only *after* painting, optional and
unverified (recovery + the Edition-0 list). Moderation gate, privacy model, and every existing
painted tile stay exactly as they are.

## Approach

Use **Supabase Anonymous Auth**. The whole app already reads `auth.getUser()`; with anonymous
sign-in enabled, `getUser()` returns a real user (anon or email) uniformly, so identity becomes
**`user.id`** everywhere instead of `user.email`.

- First time someone clicks an open tile with no session → the client calls
  `supabase.auth.signInAnonymously()` silently (no UI), then claims. One tile per `user.id`.
- Existing email painters: unchanged. Their session still has `id` + `email`; their tiles match
  by email (see dual-match below) so nobody is locked out of a tile they already own.
- At **submit**, an **optional, unverified** email field ("add your email to find this tile again").
  Stored as `artist_email` (lowercased) if given. No OTP, no verification. Feeds recovery + Edition-0.
- **Recovery** (returning on a new device) still works via the existing email OTP `SignInModal`:
  sign in with email → `findMyTile` matches the tile by `artist_email`.

**Why not IP / fingerprinting:** false-blocks shared-IP users (campus, mobile CGNAT) and is beaten
by incognito/VPN anyway. A cookie-backed anon session is exactly as strong as the current email gate
(a second email already gets a second tile today) with none of the friction. Decided.

## The one hard prerequisite (only Mickey can do this)

**Supabase Dashboard → Authentication → Sign In / Providers → enable "Anonymous sign-ins".**
Until this is on, `signInAnonymously()` errors and claiming would fail. So: toggle ON first, then we
test on the preview URL, then merge to production. (Supabase rate-limits anon sign-ins per IP by
default; fine for our window.)

## Migration — `supabase/migrations/0010_anonymous_identity.sql` (additive, idempotent)

```sql
-- identity by auth user id (works for anon + email users)
alter table public.tiles         add column if not exists artist_user_id uuid;
create index if not exists tiles_artist_user_id_idx on public.tiles (artist_user_id);

-- notifications keyed by user id (anon users have no email)
alter table public.notifications add column if not exists artist_user_id uuid;
create index if not exists notifications_user_idx on public.notifications (artist_user_id, created_at desc);

-- votes by user id; allow anon voters (no email). Replace the email-based PK with
-- per-identity partial unique indexes (no data loss; legacy email votes keep their dedup).
alter table public.tile_votes    add column if not exists voter_user_id uuid;
alter table public.tile_votes    drop constraint if exists tile_votes_pkey;
alter table public.tile_votes    alter column voter_email drop not null;
create unique index if not exists tile_votes_user_uniq  on public.tile_votes (tile_id, voter_user_id) where voter_user_id is not null;
create unique index if not exists tile_votes_email_uniq on public.tile_votes (tile_id, voter_email)  where voter_email  is not null;
```

`public_tiles` is an explicit-column view — adding columns to `tiles` does **not** expose them.
Privacy boundary untouched. `artist_user_id` is never added to the view.

## Code changes (backward-compatible everywhere)

**Identity key = `user.id`, matched OR by legacy email.** The reusable ownership predicate:
`artist_user_id === user.id  OR  (user.email && artist_email === user.email)`.

- `lib/tiles.ts` `findMyTile` → look up by `artist_user_id` (and by `artist_email` when an email
  exists), still migration-tolerant.
- `lib/notify.ts` `notify` → accept `{ email, userId }`; insert `artist_user_id` (+ email if present).
- `app/canvas/actions.ts`
  - `claimTileAt` → require a session (anon ok), drop the `user.email` gate; set
    `artist_user_id = user.id`, `artist_name` from email-local-part if present else null,
    `artist_email` only if present.
  - `toggleVote` → key on `voter_user_id`; own-tile check via the dual predicate.
- `app/paint/actions.ts`
  - `ownTile` → match by the dual predicate instead of `email` only.
  - `submitTile(tileId, image, thumb, name, story, email?)` → new optional `email`; store as
    `artist_email` if provided. Everything else unchanged.
  - `requestManualReview` log line → use `artist_email ?? artist_user_id`.
- `app/actions.ts` `markNotificationsRead` → by `artist_user_id` (email fallback).
- `app/canvas/page.tsx` & `app/page.tsx` → derive identity from `user.id`; `findMyTile` by id;
  votes by `voter_user_id`; notifications by `artist_user_id`. Pass `email` (may be null) **and** a
  `signedIn`/`hasTile` signal to the client.
- `components/Explorer.tsx`
  - `ClaimFlow` → replace the email→OTP steps with a silent `signInAnonymously()` then claim. (Keep
    the "already have a tile" / "closed" branches.)
  - Topbar → "your tile" + bell driven by having a session/tile, not by `email`; no email chip for
    anon; "Sign in" stays as the **recovery** entry (opens `SignInModal`).
  - Studio name default: "" for anon (they type a name — already required).
- `components/Studio.tsx` → add the optional email input to the submit group; thread through
  `onSubmit` → `submitTile`.
- `lib/expiry.ts`, `app/admin/actions.ts` `removeTile`, `scripts/*reset*.mjs` → add
  `artist_user_id: null` to the open/reset payloads so a reopened tile is fully clean.
- `SignInModal`, `app/auth/callback/route.ts` → unchanged (recovery path).

**Voting scope choice:** the only change touching an existing constraint is `tile_votes`. Option A
(recommended, in the migration above): anon users can vote. Option B (zero votes-table DDL): keep
voting email-gated — anon users get a "sign in to love tiles" prompt (also doubles as email capture).

## Privacy / moderation — unchanged

- `public_tiles` view, RLS posture, service-role writes: all untouched.
- Every tile still goes through the same AI + admin moderation gate before publishing. Anonymous
  changes *who* claims, never *whether content is screened*.

## Verification (nothing ships on "looks right locally")

1. Mickey enables Anonymous sign-ins.
2. Run `0010` in the Supabase SQL editor (additive; safe to re-run).
3. `cd web && npm run build` on the branch — must pass clean (types + lint).
4. Push branch → Vercel preview URL (same Supabase project). On the preview:
   incognito → click an open tile → paint → submit (no email) → it claims + enters review;
   add optional email → confirm stored; existing email account still finds its tile; vote works.
5. Only then merge to `main` (production deploy).

## Rollback

- Migration is purely additive (+ the votes index swap); it does not drop or rewrite tile data.
- If anything misbehaves, revert the branch merge — the new columns simply go unused; existing
  email-keyed tiles still resolve by `artist_email`. (Optional: an `ANON_AUTH` env flag to fall the
  claim flow back to email-OTP without a redeploy — say the word and I'll add it.)
