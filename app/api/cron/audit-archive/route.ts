import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR2Configured } from "@/lib/r2";
import { archiveClinicAuditTables } from "@/lib/auditArchive";

// Cron de archivado de auditoría clínica (ver vercel.json). Para cada clínica
// exporta a R2 las filas de odontograma/evolución más viejas que el corte de
// retención y las borra de Postgres para no crecer la base indefinidamente.
// La lógica por clínica vive en archiveClinicAuditTables() (lib/auditArchive.ts).
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
  const { data: clinics, error } = await admin.from("clinics").select("id");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let archivedRows = 0;
  let failed = 0;

  for (const c of clinics ?? []) {
    const results = await archiveClinicAuditTables(admin, c);
    for (const r of results) {
      if (r.ok) archivedRows += r.rowCount;
      else failed++;
    }
  }

  return NextResponse.json({ clinics: clinics?.length ?? 0, archivedRows, failed });
}
