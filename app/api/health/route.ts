import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Endpoint de salud para monitores de uptime (UptimeRobot, etc.). Verifica las
// dependencias críticas y devuelve 200 si todo responde, 503 si algo falla.
//
// Es público a propósito (los monitores lo consultan sin sesión) y NO expone
// secretos: solo el estado "up/down" de cada componente.
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CheckStatus = "up" | "down" | "skipped";

// Un monitor externo golpea este endpoint cada pocos minutos, 24/7, sin
// ningún uso humano detrás — era la ruta con más Active CPU de todo el
// proyecto. Cliente admin reusado entre invocaciones (mientras la instancia
// siga tibia) en vez de instanciarlo de nuevo en cada ping.
const admin = createAdminClient();

async function checkDatabase(): Promise<CheckStatus> {
  try {
    // Consulta mínima: solo cuenta cabecera, sin traer filas.
    const { error } = await admin
      .from("clinics")
      .select("id", { head: true, count: "exact" });
    return error ? "down" : "up";
  } catch {
    return "down";
  }
}

// El ping a R2 usa el SDK de AWS (S3Client + firma SigV4), pesado de cargar y
// de ejecutar. Un monitor de uptime externo llama este endpoint cada pocos
// minutos, 24/7 — con tan poco tráfico entre pings, cada llamada suele caer
// en una instancia fría, pagando esa carga completa cada vez. Cacheamos el
// resultado unos minutos (el estado de R2 no cambia segundo a segundo) e
// importamos el SDK solo cuando el caché venció, para no cargarlo en los
// pings que lo reutilizan.
const R2_CHECK_TTL_MS = 5 * 60 * 1000;
let cachedR2: { status: CheckStatus; checkedAt: number } | null = null;

async function checkR2(): Promise<CheckStatus> {
  if (cachedR2 && Date.now() - cachedR2.checkedAt < R2_CHECK_TTL_MS) {
    return cachedR2.status;
  }
  const { isR2Configured, pingR2 } = await import("@/lib/r2");
  // Si R2 no está configurado, no es un fallo: la app funciona sin fotos/respaldos.
  if (!isR2Configured()) {
    cachedR2 = { status: "skipped", checkedAt: Date.now() };
    return "skipped";
  }
  const status: CheckStatus = (await pingR2()) ? "up" : "down";
  cachedR2 = { status, checkedAt: Date.now() };
  return status;
}

// El estado "up/down" no cambia segundo a segundo — si el monitor pega cada
// 1-2 min, no hace falta re-verificar DB en cada ping. Cachea la respuesta
// completa (no solo R2) unos segundos, misma idea que checkR2 de abajo.
const HEALTH_CHECK_TTL_MS = 30 * 1000;
let cachedHealth: { body: Record<string, unknown>; status: number; checkedAt: number } | null =
  null;

export async function GET() {
  if (cachedHealth && Date.now() - cachedHealth.checkedAt < HEALTH_CHECK_TTL_MS) {
    return NextResponse.json(cachedHealth.body, {
      status: cachedHealth.status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const started = Date.now();
  const [database, storage] = await Promise.all([checkDatabase(), checkR2()]);

  // Solo los componentes críticos tumban la salud. R2 "skipped" no cuenta.
  const healthy = database === "up" && storage !== "down";
  const status = healthy ? 200 : 503;
  const body = {
    status: healthy ? "ok" : "degraded",
    checks: { database, storage },
    tookMs: Date.now() - started,
    timestamp: new Date().toISOString(),
  };
  cachedHealth = { body, status, checkedAt: Date.now() };

  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
