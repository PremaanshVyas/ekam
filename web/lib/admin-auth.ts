import { cookies } from "next/headers";
import { createHash } from "node:crypto";

export const ADMIN_COOKIE = "whll_admin";

// Cookie stores a hash of the password (not the password itself).
export function adminToken(): string {
  return createHash("sha256").update(process.env.ADMIN_PASSWORD ?? "").digest("hex");
}

// Fails CLOSED: if ADMIN_PASSWORD isn't set, nobody is admin.
export async function isAdmin(): Promise<boolean> {
  if (!process.env.ADMIN_PASSWORD) return false;
  const jar = await cookies();
  return jar.get(ADMIN_COOKIE)?.value === adminToken();
}
