import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR2Configured } from "@/lib/r2";
import { backupClinicToR2 } from "@/lib/clinicBackupR2";

export const runtime = "nodejs";
export const maxDuration = 300;

// Respaldo MANUAL a R2 de UNA clínica ("Respaldar ahora"). Solo superadmin.
// Misma lógica que el cron (snapshot + verificación + subida + registro), pero a
// demanda. Útil para forzar una copia antes de un cambio grande.
export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin()))
    return NextResponse.json({ ok: false, message: "No autorizado" }, { status: 403 });

  if (!isR2Configured())
    return NextResponse.json(
      { ok: false, message: "R2 no está configurado: no hay dónde guardar el respaldo." },
      { status: 503 },
    );

  const body = await req.json().catch(() => null);
  const clinicId = typeof body?.clinicId === "string" ? body.clinicId : "";
  if (!clinicId)
    return NextResponse.json({ ok: false, message: "Falta clinicId." }, { status: 400 });

  const admin = createAdminClient();
  const { data: clinic } = await admin
    .from("clinics")
    .select("id, name")
    .eq("id", clinicId)
    .maybeSingle();
  if (!clinic)
    return NextResponse.json({ ok: false, message: "Clínica no encontrada." }, { status: 404 });

  const result = await backupClinicToR2(admin, clinic);
  if (!result.ok)
    return NextResponse.json(
      { ok: false, message: `Falló el respaldo: ${result.error}` },
      { status: 500 },
    );

  return NextResponse.json({
    ok: true,
    sizeBytes: result.sizeBytes,
    rowCount: result.rowCount,
  });
}
