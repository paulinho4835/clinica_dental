// Cálculo PURO de índices periodontales a partir de las mediciones de un examen.
// Sin dependencias de React/DB → testeable directo (ver tests/perio.test.ts).

import {
  SITE_KEYS,
  PD_WARN_MM,
  PD_DEEP_MM,
  type PerioMeasurements,
  type SiteMeasurement,
} from "./types";

// Nivel de inserción clínico de un sitio = profundidad de sondaje + recesión.
// Devuelve null si no hay profundidad registrada (el sitio no se sondó).
export function siteCal(site: SiteMeasurement | undefined): number | null {
  if (!site || typeof site.pd !== "number" || !Number.isFinite(site.pd)) {
    return null;
  }
  const rec = typeof site.rec === "number" && Number.isFinite(site.rec) ? site.rec : 0;
  return site.pd + rec;
}

export interface PerioIndices {
  teethPresent: number;
  sitesProbed: number; // sitios con profundidad registrada (denominador de %)
  bopPercent: number | null; // % sangrado al sondaje
  plaquePercent: number | null; // % placa
  deepestPocket: number | null; // bolsa más profunda (mm)
  meanCal: number | null; // NIC promedio (mm)
  pockets4plus: number; // nº de sitios con PS ≥ 4mm
  pockets6plus: number; // nº de sitios con PS ≥ 6mm
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function computeIndices(measurements: PerioMeasurements): PerioIndices {
  let teethPresent = 0;
  let sitesProbed = 0;
  let bleeding = 0;
  let plaque = 0;
  let deepestPocket: number | null = null;
  let calSum = 0;
  let calCount = 0;
  let pockets4plus = 0;
  let pockets6plus = 0;

  for (const tooth of Object.values(measurements ?? {})) {
    if (!tooth?.present) continue;
    teethPresent += 1;

    for (const key of SITE_KEYS) {
      const site = tooth.sites?.[key];
      if (!site || !isNum(site.pd)) continue;
      sitesProbed += 1;

      const pd = site.pd;
      if (deepestPocket === null || pd > deepestPocket) deepestPocket = pd;
      if (pd >= PD_WARN_MM) pockets4plus += 1;
      if (pd >= PD_DEEP_MM) pockets6plus += 1;

      if (site.bop) bleeding += 1;
      if (site.plaque) plaque += 1;

      const cal = siteCal(site);
      if (cal !== null) {
        calSum += cal;
        calCount += 1;
      }
    }
  }

  const pct = (n: number) =>
    sitesProbed > 0 ? Math.round((n / sitesProbed) * 100) : null;

  return {
    teethPresent,
    sitesProbed,
    bopPercent: pct(bleeding),
    plaquePercent: pct(plaque),
    deepestPocket,
    meanCal: calCount > 0 ? Math.round((calSum / calCount) * 10) / 10 : null,
    pockets4plus,
    pockets6plus,
  };
}
