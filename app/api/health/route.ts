import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isR2Configured, pingR2 } from "@/lib/r2";

// Endpoint de salud para monitores de uptime (UptimeRobot, etc.). Verifica las
// dependencias críticas y devuelve 200 si todo responde, 503 si algo falla.
//
// Es público a propósito (los monitores lo consultan sin sesión) y NO expone
// secretos: solo el estado "up/down" de cada componente. Nunca se cachea.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CheckStatus = "up" | "down" | "skipped";

async function checkDatabase(): Promise<CheckStatus> {
  try {
    const admin = createAdminClient();
    // Consulta mínima: solo cuenta cabecera, sin traer filas.
    const { error } = await admin
      .from("clinics")
      .select("id", { head: true, count: "exact" });
    return error ? "down" : "up";
  } catch {
    return "down";
  }
}

async function checkR2(): Promise<CheckStatus> {
  // Si R2 no está configurado, no es un fallo: la app funciona sin fotos/respaldos.
  if (!isR2Configured()) return "skipped";
  return (await pingR2()) ? "up" : "down";
}

export async function GET() {
  const started = Date.now();
  const [database, storage] = await Promise.all([checkDatabase(), checkR2()]);

  // Solo los componentes críticos tumban la salud. R2 "skipped" no cuenta.
  const healthy = database === "up" && storage !== "down";

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      checks: { database, storage },
      tookMs: Date.now() - started,
      timestamp: new Date().toISOString(),
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
