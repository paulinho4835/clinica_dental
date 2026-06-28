import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR2Configured } from "@/lib/r2";
import { backupClinicToR2 } from "@/lib/clinicBackupR2";

// Cron de respaldos automáticos (ver vercel.json). Para cada clínica genera el
// snapshot completo, lo verifica, lo sube a R2 y registra el resultado. La lógica
// por clínica vive en backupClinicToR2() (compartida con el botón manual
// "Respaldar ahora"). Así hay respaldo offsite verificado sin intervención manual.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  // Seguridad: Vercel Cron incluye 'Authorization: Bearer ${CRON_SECRET}'.
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  if (!isR2Configured()) {
    return NextResponse.json({ skipped: "R2 no configurado" });
  }

  const admin = createAdminClient();
  const { data: clinics, error } = await admin.from("clinics").select("id, name");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let ok = 0;
  let failed = 0;

  for (const c of clinics ?? []) {
    const result = await backupClinicToR2(admin, c);
    if (result.ok) ok++;
    else failed++;
  }

  return NextResponse.json({ clinics: clinics?.length ?? 0, ok, failed });
}
