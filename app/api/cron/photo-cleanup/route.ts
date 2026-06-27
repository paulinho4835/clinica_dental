import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR2Configured, listAllObjects, deleteObject } from "@/lib/r2";

// Cron de higiene (ver vercel.json). Borra de R2 los objetos HUÉRFANOS: archivos
// que se subieron (PUT a la URL firmada) pero cuyo `registerPhoto` nunca corrió
// (p.ej. cerraron la pestaña a mitad), por lo que no tienen fila en patient_photos.
// Sin esto, esos objetos se quedan para siempre pagando almacenamiento.
//
// Margen de seguridad: solo se borran objetos con más de GRACE_HOURS de
// antigüedad, para no eliminar una subida en curso (subió, aún no registra).
export const dynamic = "force-dynamic";

const GRACE_HOURS = 24;

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
    return NextResponse.json({ skipped: "R2 no configurado", deleted: 0 });
  }

  const supabase = createAdminClient();

  // Todas las referencias vivas (las que SÍ deben existir en R2).
  const { data: rows, error } = await supabase
    .from("patient_photos")
    .select("storage_key");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const liveKeys = new Set((rows ?? []).map((r) => r.storage_key as string));

  const cutoff = Date.now() - GRACE_HOURS * 3600 * 1000;
  const objects = await listAllObjects();

  let deleted = 0;
  let skippedRecent = 0;
  for (const o of objects) {
    // Los respaldos automáticos (cron/backup) viven bajo backups/ en el mismo
    // bucket: NO son fotos huérfanas, nunca borrarlos aquí.
    if (o.key.startsWith("backups/")) continue;
    if (liveKeys.has(o.key)) continue; // tiene fila → válido
    // Sin fila pero reciente: probablemente una subida en curso → no tocar.
    if (o.lastModified && o.lastModified.getTime() > cutoff) {
      skippedRecent++;
      continue;
    }
    await deleteObject(o.key).catch(() => {});
    deleted++;
  }

  return NextResponse.json({
    scanned: objects.length,
    live: liveKeys.size,
    deleted,
    skippedRecent,
  });
}
