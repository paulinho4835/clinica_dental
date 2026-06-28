import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { restoreBackupAsNewClinic } from "@/lib/restoreClinic";

export const runtime = "nodejs";

// Restaura un backup SUBIDO (archivo .json) como una clínica NUEVA (clon). Solo
// superadmin. El remapeo de ids/FKs y el insert atómico viven en
// restoreBackupAsNewClinic() (compartido con la restauración desde R2).
export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin()))
    return NextResponse.json({ ok: false, message: "No autorizado" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ ok: false, message: "Falta el archivo de backup." }, { status: 400 });

  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ ok: false, message: "El archivo no es un JSON válido." }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await restoreBackupAsNewClinic(admin, parsed);
  if (!result.ok)
    return NextResponse.json(
      { ok: false, message: result.message, violations: result.violations },
      { status: result.status },
    );

  return NextResponse.json({ ok: true, clinicId: result.clinicId, name: result.name });
}
