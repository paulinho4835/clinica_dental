import "server-only";
import { putObject } from "@/lib/r2";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// Después de este tiempo, las filas de auditoría clínica se archivan a R2 y se
// borran de Postgres para no crecer la base indefinidamente. El historial NO
// se pierde: queda como JSON en R2, solo deja de ocupar espacio en la DB activa.
export const AUDIT_ARCHIVE_AFTER_DAYS = 730; // ~2 años

const ARCHIVE_TABLES = [
  { table: "odontogram_events", timestampColumn: "created_at" },
  { table: "odontogram_pediatric_events", timestampColumn: "created_at" },
  { table: "patient_evolution_note_history", timestampColumn: "changed_at" },
] as const;

const PAGE_SIZE = 1000;

export type ArchiveTableResult =
  | { ok: true; table: string; rowCount: number; key: string | null }
  | { ok: false; table: string; error: string };

// Trae TODAS las filas de una tabla más viejas que el corte, paginando de a
// PAGE_SIZE (límite de PostgREST por request).
async function fetchAllOlderThan(
  admin: Admin,
  table: string,
  timestampColumn: string,
  clinicId: string,
  cutoffIso: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .eq("clinic_id", clinicId)
      .lt(timestampColumn, cutoffIso)
      .order(timestampColumn, { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

// Archiva y poda UNA tabla de auditoría para UNA clínica: exporta a R2 lo más
// viejo que el corte, y solo si la subida no lanza, borra esas mismas filas de
// Postgres (mismo filtro clinic_id + corte, así que no hay riesgo de borrar
// algo que no se llegó a exportar). Nunca lanza: ante un fallo, devuelve
// { ok: false } y no borra nada.
async function archiveTable(
  admin: Admin,
  clinicId: string,
  table: string,
  timestampColumn: string,
  cutoffIso: string,
  date: string,
): Promise<ArchiveTableResult> {
  try {
    const rows = await fetchAllOlderThan(admin, table, timestampColumn, clinicId, cutoffIso);
    if (rows.length === 0) return { ok: true, table, rowCount: 0, key: null };

    const key = `archives/${clinicId}/${table}/${date}.json`;
    const json = JSON.stringify({ table, clinic_id: clinicId, cutoff: cutoffIso, rows });
    await putObject(key, json, "application/json");

    const { error: delErr } = await admin
      .from(table)
      .delete()
      .eq("clinic_id", clinicId)
      .lt(timestampColumn, cutoffIso);
    if (delErr) throw new Error(delErr.message);

    return { ok: true, table, rowCount: rows.length, key };
  } catch (e) {
    return { ok: false, table, error: e instanceof Error ? e.message : String(e) };
  }
}

// Archiva las 3 tablas de auditoría clínica de UNA clínica y registra en
// audit_archive_runs solo lo que efectivamente pasó algo (filas archivadas o
// error) — si no había nada viejo que archivar, no deja fila (evita ruido
// semanal en la tabla de tracking para clínicas nuevas/pequeñas).
export async function archiveClinicAuditTables(
  admin: Admin,
  clinic: { id: string },
  afterDays = AUDIT_ARCHIVE_AFTER_DAYS,
): Promise<ArchiveTableResult[]> {
  const date = new Date().toISOString().slice(0, 10);
  const cutoffIso = new Date(Date.now() - afterDays * 24 * 60 * 60 * 1000).toISOString();

  const results: ArchiveTableResult[] = [];
  for (const { table, timestampColumn } of ARCHIVE_TABLES) {
    const result = await archiveTable(admin, clinic.id, table, timestampColumn, cutoffIso, date);
    results.push(result);

    if (result.ok && result.rowCount === 0) continue;

    await admin.from("audit_archive_runs").insert(
      result.ok
        ? {
            clinic_id: clinic.id,
            table_name: result.table,
            status: "ok",
            storage_key: result.key,
            row_count: result.rowCount,
            cutoff_at: cutoffIso,
          }
        : {
            clinic_id: clinic.id,
            table_name: result.table,
            status: "error",
            error: result.error,
            cutoff_at: cutoffIso,
          },
    );
  }
  return results;
}
