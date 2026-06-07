import { NextResponse } from "next/server";
import { reopenExpiredClaims } from "@/lib/expiry";

export const dynamic = "force-dynamic";

// Hit by Vercel Cron (see vercel.json). If CRON_SECRET is set, Vercel sends it as
// `Authorization: Bearer <CRON_SECRET>` — we require it. If unset, runs open (low risk).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const reopened = await reopenExpiredClaims();
  return NextResponse.json({ reopened });
}
