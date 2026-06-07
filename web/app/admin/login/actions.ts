"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminToken } from "@/lib/admin-auth";

export async function login(formData: FormData) {
  const pw = String(formData.get("password") || "");
  const real = process.env.ADMIN_PASSWORD;
  if (!real || pw !== real) redirect("/admin/login?error=1");

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // allow http on localhost
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/admin");
}
