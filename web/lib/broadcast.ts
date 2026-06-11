// Nudge every open canvas client that the wall changed (claim / publish / reject /
// remove). Uses Supabase Realtime's REST broadcast endpoint — serverless-friendly
// (no websocket), RLS-irrelevant (no row data travels; clients just refetch).
// Best effort: a failed broadcast never breaks the action that triggered it.
export async function broadcastWallChange(): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ topic: "wall", event: "tiles", payload: { at: Date.now() } }] }),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {});
  } catch { /* best effort */ }
}
