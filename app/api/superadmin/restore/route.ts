import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildRestorePayload,
  collectProfileIds,
  type BackupFile,
  type BackupSchema,
} from "@/lib/clinicBackup";

export const runtime = "nodejs";

// Restaura un backup como una clínica NUEVA (clon). Solo superadmin.
// El remapeo de ids/FKs ocurre aquí; el insert atómico en restore_clinic_apply().
export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin()))
    return NextResponse.json({ ok: false, message: "No autorizado" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File))
    return NextResponse.json({ ok: false, message: "Falta el archivo de backup." }, { status: 400 });

  let backup: BackupFile;
  try {
    backup = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ ok: false, message: "El archivo no es un JSON válido." }, { status: 400 });
  }

  if (backup?.version !== 1 || !backup.clinic || !backup.tables)
    return NextResponse.json(
      { ok: false, message: "Formato de backup no reconocido." },
      { status: 400 },
    );

  const admin = createAdminClient();

  const { data: schemaData, error: schemaErr } = await admin.rpc("clinic_backup_schema");
  if (schemaErr || !schemaData)
    return NextResponse.json(
      { ok: false, message: `No se pudo leer el esquema: ${schemaErr?.message ?? "vacío"}` },
      { status: 500 },
    );
  const schema = schemaData as BackupSchema;

  // ¿Qué cuentas (profiles) referenciadas siguen existiendo? Las que no, se nulean.
  const profileIds = collectProfileIds(backup, schema);
  const liveProfileIds = new Set<string>();
  if (profileIds.size > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("id")
      .in("id", [...profileIds]);
    for (const p of profs ?? []) liveProfileIds.add(p.id as string);
  }

  const result = buildRestorePayload(backup, schema, liveProfileIds);
  if (!result.ok) {
    const detail = result.violations
      .map((v) => `${v.table}.${v.column} (${v.count} fila${v.count === 1 ? "" : "s"})`)
      .join(", ");
    return NextResponse.json(
      {
        ok: false,
        message:
          "No se puede restaurar: hay registros cuya cuenta de personal ya no existe y es obligatoria. " +
          `Recrea esas cuentas antes de restaurar. Afectados: ${detail}.`,
        violations: result.violations,
      },
      { status: 422 },
    );
  }

  const { newClinic, ordered } = result.payload;
  const { data: newId, error } = await admin.rpc("restore_clinic_apply", {
    p_new_clinic: newClinic,
    p_ordered: ordered,
  });
  if (error)
    return NextResponse.json(
      { ok: false, message: `Falló la restauración: ${error.message}` },
      { status: 500 },
    );

  return NextResponse.json({ ok: true, clinicId: newId, name: result.newName });
}
