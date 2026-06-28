import "server-only";
import { putObject, deleteObject } from "@/lib/r2";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// Respaldos a conservar por clínica en R2 (con el cron semanal → ~2 meses).
export const BACKUPS_KEEP_PER_CLINIC = 8;

export type BackupToR2Result =
  | { ok: true; key: string; sizeBytes: number; tableCount: number; rowCount: number }
  | { ok: false; error: string };

// Genera el snapshot completo de UNA clínica, lo verifica, lo sube a R2 bajo
// backups/{clinic_id}/{fecha}.json, registra el resultado en backup_runs y poda
// los antiguos. Lo usan tanto el cron (todas las clínicas) como el botón manual
// "Respaldar ahora" (una clínica). Nunca lanza: ante un fallo, registra el error
// en backup_runs y devuelve { ok: false }.
export async function backupClinicToR2(
  admin: Admin,
  clinic: { id: string; name?: string | null },
  keepPerClinic = BACKUPS_KEEP_PER_CLINIC,
): Promise<BackupToR2Result> {
  const date = new Date().toISOString().slice(0, 10);
  try {
    const { data: backup, error: bErr } = await admin.rpc("backup_clinic", {
      p_clinic_id: clinic.id,
    });
    if (bErr || !backup) throw new Error(bErr?.message ?? "el backup salió vacío");

    // Verificación de integridad: estructura mínima + conteos reales. Un backup
    // sin objeto `clinic` está corrupto y no serviría para restaurar.
    if (!(backup as { clinic?: unknown }).clinic) {
      throw new Error("backup sin objeto 'clinic' (corrupto)");
    }
    const tables = (backup as { tables?: Record<string, unknown[]> }).tables ?? {};
    const tableNames = Object.keys(tables);
    const rowCount = tableNames.reduce(
      (sum, t) => sum + (Array.isArray(tables[t]) ? tables[t].length : 0),
      0,
    );

    const json = JSON.stringify(backup);
    const sizeBytes = Buffer.byteLength(json, "utf8");
    const key = `backups/${clinic.id}/${date}.json`;
    await putObject(key, json, "application/json");

    await admin.from("backup_runs").insert({
      clinic_id: clinic.id,
      status: "ok",
      storage_key: key,
      size_bytes: sizeBytes,
      table_count: tableNames.length,
      row_count: rowCount,
    });

    // Poda: conservar solo los más recientes. Antes de borrar el objeto en R2,
    // verificar que NINGÚN run sobreviviente apunte a la misma key (un respaldo
    // manual el mismo día comparte key con el del cron) para no dejar filas
    // huérfanas apuntando a un objeto borrado.
    const { data: oldRuns } = await admin
      .from("backup_runs")
      .select("id, storage_key")
      .eq("clinic_id", clinic.id)
      .eq("status", "ok")
      .order("created_at", { ascending: false })
      .range(keepPerClinic, keepPerClinic + 100);
    for (const o of oldRuns ?? []) {
      const storageKey = o.storage_key as string | null;
      if (storageKey) {
        const { count } = await admin
          .from("backup_runs")
          .select("id", { head: true, count: "exact" })
          .eq("storage_key", storageKey)
          .neq("id", o.id);
        if (!count) await deleteObject(storageKey).catch(() => {});
      }
      await admin.from("backup_runs").delete().eq("id", o.id);
    }

    return { ok: true, key, sizeBytes, tableCount: tableNames.length, rowCount };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await admin.from("backup_runs").insert({
      clinic_id: clinic.id,
      status: "error",
      error,
    });
    return { ok: false, error };
  }
}
