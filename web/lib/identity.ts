import type { User } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/lib/auth-server";

// One identity for both anonymous and email sessions. `userId` is always present (the
// auth user id, anonymous or not); `email` is null for anonymous users. This is the
// single source of truth the server uses to own tiles, votes and notifications.
export type Identity = { userId: string; email: string | null };

// Build an Identity from an already-fetched auth user (pages that batch getUser() with
// other queries use this so they don't pay a second round trip).
export function identityOf(user: User | null | undefined): Identity | null {
  if (!user) return null;
  return { userId: user.id, email: user.email ? user.email.toLowerCase() : null };
}

// The signed-in identity, or null when there is no session at all. (We never require an
// email here — an anonymous session is a real, fully-valid identity.)
export async function currentIdentity(): Promise<Identity | null> {
  const auth = await createSupabaseServer();
  const { data: { user } } = await auth.auth.getUser();
  return identityOf(user);
}

// PostgREST `.or()` filter that matches a row to this identity by user id OR legacy email.
// Used for searches (find-my-tile, my-votes, my-notifications). Defaults to the tile/owner
// columns; pass column names for votes (voter_user_id / voter_email).
export function ownerOr(id: Identity, userCol = "artist_user_id", emailCol = "artist_email"): string {
  return id.email ? `${userCol}.eq.${id.userId},${emailCol}.eq.${id.email}` : `${userCol}.eq.${id.userId}`;
}

// In-memory ownership test for a row we already hold (specific tile by id, etc.).
export function owns(id: Identity, row: { artist_user_id?: string | null; artist_email?: string | null }): boolean {
  if (row.artist_user_id && row.artist_user_id === id.userId) return true;
  return !!id.email && !!row.artist_email && row.artist_email.toLowerCase() === id.email;
}
