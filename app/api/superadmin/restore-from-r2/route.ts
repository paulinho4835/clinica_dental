import { NextRequest, NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getObjectText } from "@/lib/r2";
import { restoreBackupAsNewClinic } from "@/lib/restoreClinic";

export const runtime = "nodejs";
export const maxDuration = 300;

// Restaura un backup YA GUARDADO en R2 como una clínica NUEVA (clon). Solo
// superadmin. En vez de subir un archivo, se pasa el storage_key de un respaldo
// existente (el de la lista de respaldos automáticos). Mismo motor de
// restauración que la ruta de subida.
export async function POST(req: NextRequest) {
  if (!(await isPlatformAdmin()))
    return NextResponse.json({ ok: false, message: "No autorizado" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const storageKey = typeof body?.storageKey === "string" ? body.storageKey : "";
  if (!storageKey)
    return NextResponse.json({ ok: false, message: "Falta storageKey." }, { status: 400 });

  const admin = createAdminClient();

  // Seguridad: solo se restauran objetos que correspondan a un respaldo real
  // registrado en backup_runs (no una key arbitraria del bucket).
  const { data: run } = await admin
    .from("backup_runs")
    .select("id")
    .eq("storage_key", storageKey)
    .eq("status", "ok")
    .maybeSingle();
  if (!run)
    return NextResponse.json(
      { ok: false, message: "Ese respaldo no existe en el historial." },
      { status: 404 },
    );

  let parsed: unknown;
  try {
    parsed = JSON.parse(await getObjectText(storageKey));
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: `No se pudo leer el respaldo de R2: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }

  const result = await restoreBackupAsNewClinic(admin, parsed);
  if (!result.ok)
    return NextResponse.json(
      { ok: false, message: result.message, violations: result.violations },
      { status: result.status },
    );

  return NextResponse.json({ ok: true, clinicId: result.clinicId, name: result.name });
}
