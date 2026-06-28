import "server-only";
import {
  buildRestorePayload,
  collectProfileIds,
  type BackupFile,
  type BackupSchema,
  type RestoreViolation,
} from "@/lib/clinicBackup";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// Resultado uniforme de una restauración. `status` mapea al HTTP que devuelve la
// ruta (200/400/422/500) para que ambas rutas (subir archivo / desde R2) respondan
// igual.
export type RestoreOutcome =
  | { ok: true; clinicId: string; name: string }
  | { ok: false; status: number; message: string; violations?: RestoreViolation[] };

// Valida el formato mínimo de un objeto de backup ya parseado.
function isValidBackup(b: unknown): b is BackupFile {
  const v = b as BackupFile | null;
  return !!v && v.version === 1 && !!v.clinic && !!v.tables;
}

// Restaura un backup (ya parseado a objeto) como una clínica NUEVA (clon). Toda
// la mecánica de remapeo de ids/FKs y el insert atómico vive aquí; las rutas solo
// obtienen el JSON (de un archivo subido o de R2) y delegan en esta función.
export async function restoreBackupAsNewClinic(
  admin: Admin,
  parsed: unknown,
): Promise<RestoreOutcome> {
  if (!isValidBackup(parsed))
    return { ok: false, status: 400, message: "Formato de backup no reconocido." };
  const backup = parsed;

  const { data: schemaData, error: schemaErr } = await admin.rpc("clinic_backup_schema");
  if (schemaErr || !schemaData)
    return {
      ok: false,
      status: 500,
      message: `No se pudo leer el esquema: ${schemaErr?.message ?? "vacío"}`,
    };
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
    return {
      ok: false,
      status: 422,
      message:
        "No se puede restaurar: hay registros cuya cuenta de personal ya no existe y es obligatoria. " +
        `Recrea esas cuentas antes de restaurar. Afectados: ${detail}.`,
      violations: result.violations,
    };
  }

  const { newClinic, ordered } = result.payload;
  const { data: newId, error } = await admin.rpc("restore_clinic_apply", {
    p_new_clinic: newClinic,
    p_ordered: ordered,
  });
  if (error)
    return { ok: false, status: 500, message: `Falló la restauración: ${error.message}` };

  return { ok: true, clinicId: newId as string, name: result.newName };
}
