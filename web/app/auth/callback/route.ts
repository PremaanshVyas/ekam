import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/auth-server";

// Magic-link lands here with a PKCE ?code= — exchange it for a session, then continue.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/canvas";

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/claim?autherror=1`);
}
