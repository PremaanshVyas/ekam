import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin, CANVAS_SLUG } from "./supabase";

export const CLAIM_WINDOW_MS = 48 * 60 * 60 * 1000;

// closes_at for the active canvas; null when unset or migration 0008 hasn't run.
export async function canvasClosesAt(db: SupabaseClient = supabaseAdmin()): Promise<string | null> {
  if (process.env.CLOSES_AT_TEST) return process.env.CLOSES_AT_TEST; // local probe only
  try {
    const { data, error } = await db.from("canvases").select("closes_at").eq("slug", CANVAS_SLUG).maybeSingle();
    if (error) return null;
    return (data as { closes_at: string | null } | null)?.closes_at ?? null;
  } catch { return null; }
}

export const canvasClosed = (closesAt: string | null) => !!closesAt && Date.now() >= Date.parse(closesAt);

// A fresh 48h painting window, never extending past the canvas deadline.
export function claimWindowEnd(closesAt: string | null): string {
  const end = Date.now() + CLAIM_WINDOW_MS;
  const capped = closesAt ? Math.min(end, Date.parse(closesAt)) : end;
  return new Date(capped).toISOString();
}
