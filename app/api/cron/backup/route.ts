import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR2Configured, putObject, deleteObject } from "@/lib/r2";

// Cron de respaldos automáticos (ver vercel.json). Para cada clínica:
//   1) genera el snapshot completo con backup_clinic() (migración 0050),
//   2) VERIFICA su integridad (tiene objeto clinic + cuenta tablas/filas),
//   3) lo sube a R2 bajo backups/{clinic_id}/{fecha}.json,
//   4) registra el resultado en backup_runs (0068) y poda los antiguos.
// Así hay respaldo offsite verificado sin intervención manual.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Respaldos a conservar por clínica (semanal → ~2 meses de historia).
const KEEP_PER_CLINIC = 8;

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

  const date = new Date().toISOString().slice(0, 10);
  let ok = 0;
  let failed = 0;

  for (const c of clinics ?? []) {
    try {
      const { data: backup, error: bErr } = await admin.rpc("backup_clinic", {
        p_clinic_id: c.id,
      });
      if (bErr || !backup) throw new Error(bErr?.message ?? "el backup salió vacío");

      // Verificación de integridad: estructura mínima esperada + conteos reales.
      // Un backup sin objeto `clinic` está corrupto y no serviría para restaurar.
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
      const key = `backups/${c.id}/${date}.json`;
      await putObject(key, json, "application/json");

      await admin.from("backup_runs").insert({
        clinic_id: c.id,
        status: "ok",
        storage_key: key,
        size_bytes: sizeBytes,
        table_count: tableNames.length,
        row_count: rowCount,
      });
      ok++;

      // Poda: conservar solo los KEEP_PER_CLINIC más recientes (borra R2 + fila).
      const { data: oldRuns } = await admin
        .from("backup_runs")
        .select("id, storage_key")
        .eq("clinic_id", c.id)
        .eq("status", "ok")
        .order("created_at", { ascending: false })
        .range(KEEP_PER_CLINIC, KEEP_PER_CLINIC + 100);
      for (const o of oldRuns ?? []) {
        if (o.storage_key) await deleteObject(o.storage_key as string).catch(() => {});
        await admin.from("backup_runs").delete().eq("id", o.id);
      }
    } catch (e) {
      failed++;
      await admin.from("backup_runs").insert({
        clinic_id: c.id,
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ clinics: clinics?.length ?? 0, ok, failed });
}
