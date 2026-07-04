import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getClinicFeatures } from "@/lib/superadmin";

const WA_URL = process.env.WA_SERVICE_URL ?? "http://localhost:3001";

export async function POST() {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
  if (!can(profile?.role, "appointments:write")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  if (!features.whatsapp) {
    return NextResponse.json({ error: "Módulo WhatsApp no habilitado para esta clínica" }, { status: 403 });
  }
  if (!profile?.clinicId) {
    return NextResponse.json({ error: "Sin clínica" }, { status: 400 });
  }

  try {
    const res = await fetch(`${WA_URL}/send-reminders/${profile.clinicId}`, {
      method: "POST",
      headers: { "x-wa-service-secret": process.env.WA_SERVICE_SECRET ?? "" },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch {
    return NextResponse.json(
      { error: "Servicio WhatsApp no disponible. ¿Está corriendo whatsapp-service?" },
      { status: 503 },
    );
  }
}
