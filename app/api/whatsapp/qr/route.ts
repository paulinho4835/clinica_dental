import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { getClinicFeatures } from "@/lib/superadmin";

const WA_URL = process.env.WA_SERVICE_URL ?? "http://localhost:3001";

// Devuelve { connected, qr: dataURL | null } para el panel de ajustes.
export async function GET() {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
  if (!profile?.clinicId || !features.whatsapp) {
    return NextResponse.json({ connected: false, qr: null }, { status: 403 });
  }

  try {
    const res = await fetch(`${WA_URL}/qr-data/${profile.clinicId}`, {
      headers: { "x-wa-service-secret": process.env.WA_SERVICE_SECRET ?? "" },
      signal: AbortSignal.timeout(8_000),
    });
    const body = await res.json();
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ connected: false, qr: null, serviceDown: true });
  }
}
