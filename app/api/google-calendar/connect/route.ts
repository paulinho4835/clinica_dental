import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getGoogleAuthUrl } from "@/lib/google-calendar/client";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function GET() {
  const profile = await getProfile();
  if (!profile || !can(profile.role, "clinical:write")) {
    return NextResponse.redirect(new URL("/ajustes", SITE_URL));
  }

  // Token anti-CSRF: se guarda en cookie httpOnly y se compara en el callback.
  const state = randomUUID();
  const jar = await cookies();
  jar.set("gcal_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 min, de sobra para completar el consent de Google
    path: "/",
  });

  return NextResponse.redirect(getGoogleAuthUrl(state));
}
