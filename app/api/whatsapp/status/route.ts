import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { getClinicFeatures } from "@/lib/superadmin";

const WA_URL = process.env.WA_SERVICE_URL ?? "http://localhost:3001";

export async function GET() {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
  if (!profile?.clinicId) {
    return NextResponse.json({ error: "Sin clínica" }, { status: 400 });
  }
  if (!features.whatsapp) {
    return NextResponse.json({ connected: false, hasQR: false, enabled: false });
  }

  try {
    const res = await fetch(`${WA_URL}/status/${profile.clinicId}`, {
      signal: AbortSignal.timeout(5_000),
    });
    const body = await res.json();
    return NextResponse.json({ ...body, enabled: true });
  } catch {
    return NextResponse.json({ connected: false, hasQR: false, enabled: true, serviceDown: true });
  }
}
