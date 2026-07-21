import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getProfile } from "@/lib/auth";
import { exchangeCodeForTokens } from "@/lib/google-calendar/client";
import { saveTokens } from "@/lib/google-calendar/tokens";
import { backfillDoctorAppointments } from "@/lib/google-calendar/sync";

export const dynamic = "force-dynamic";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function ajustesUrl(status: "ok" | "error"): URL {
  const url = new URL("/ajustes", SITE_URL);
  url.searchParams.set("gcal", status);
  return url;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const profile = await getProfile();
  if (!profile) return NextResponse.redirect(ajustesUrl("error"));

  const jar = await cookies();
  const expectedState = jar.get("gcal_oauth_state")?.value;
  jar.delete("gcal_oauth_state");
  if (!code || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(ajustesUrl("error"));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveTokens(profile.userId, profile.clinicId, tokens);
    await backfillDoctorAppointments(profile.userId);
  } catch (err) {
    console.error("google-calendar callback falló:", err);
    return NextResponse.redirect(ajustesUrl("error"));
  }

  return NextResponse.redirect(ajustesUrl("ok"));
}
