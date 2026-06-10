import { cookies } from "next/headers";
import { createHash, timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "whll_admin";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

// Constant-time string compare (hash both sides first so length never leaks).
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(sha256(a)), bb = Buffer.from(sha256(b));
  return timingSafeEqual(ab, bb);
}

// Cookie stores a hash of the password (not the password itself).
export function adminToken(): string {
  return sha256(process.env.ADMIN_PASSWORD ?? "");
}

export function passwordMatches(pw: string): boolean {
  const real = process.env.ADMIN_PASSWORD;
  return !!real && safeEqual(pw, real);
}

// Fails CLOSED: if ADMIN_PASSWORD isn't set, nobody is admin.
export async function isAdmin(): Promise<boolean> {
  if (!process.env.ADMIN_PASSWORD) return false;
  const jar = await cookies();
  const v = jar.get(ADMIN_COOKIE)?.value;
  return !!v && safeEqual(v, adminToken());
}
