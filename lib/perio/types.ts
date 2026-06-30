// Modelo del periodontograma SIN imágenes: todo dato estructurado (JSONB en
// Postgres, columna perio_exams.measurements). Cada examen es una foto fechada;
// el NIC y los índices se derivan en la app (ver lib/perio/indices.ts).

// Los 6 sitios por diente: cara vestibular y palatina/lingual, cada una con
// mesial / centro / distal. Códigos cortos para que el JSONB sea compacto.
export const SITE_KEYS = ["vm", "vc", "vd", "pm", "pc", "pd"] as const;
export type SiteKey = (typeof SITE_KEYS)[number];

// Sitios de cada cara, en orden de captura (mesial → distal). Se usa para el
// auto-avance del foco al teclear la profundidad de sondaje.
export const BUCCAL_SITES: SiteKey[] = ["vm", "vc", "vd"];
export const LINGUAL_SITES: SiteKey[] = ["pm", "pc", "pd"];

export const SITE_LABELS: Record<SiteKey, string> = {
  vm: "Vestibular mesial",
  vc: "Vestibular centro",
  vd: "Vestibular distal",
  pm: "Palatino/lingual mesial",
  pc: "Palatino/lingual centro",
  pd: "Palatino/lingual distal",
};

// Medición de un sitio. Todos opcionales: un examen a medio llenar es válido.
//   pd  = profundidad de sondaje (mm)
//   rec = recesión gingival (mm; el margen apical al LAC). NIC = pd + rec.
//   bop = sangrado al sondaje
//   plaque = placa visible
export interface SiteMeasurement {
  pd?: number | null;
  rec?: number | null;
  bop?: boolean;
  plaque?: boolean;
}

// Movilidad y furca son por DIENTE (grados 0-3). Furca solo es clínicamente
// relevante en molares (multirradiculares); en el resto se ignora.
export interface ToothPerio {
  present: boolean;
  mobility?: number | null; // 0-3
  furcation?: number | null; // 0-3
  sites: Partial<Record<SiteKey, SiteMeasurement>>;
}

// measurements: mapa numeración FDI -> mediciones del diente.
export type PerioMeasurements = Record<string, ToothPerio>;

// Reexporta el orden de cuadrantes FDI del odontograma para no duplicar la
// numeración (misma dentición permanente).
export { QUADRANTS } from "@/lib/odontogram/types";

export const DEFAULT_TOOTH_PERIO: ToothPerio = { present: true, sites: {} };

// Umbrales de color para la profundidad de sondaje (lectura clínica inmediata).
//   < 4mm  sano        ≥ 4mm  alerta (ámbar)     ≥ 6mm  bolsa profunda (rojo)
export const PD_WARN_MM = 4;
export const PD_DEEP_MM = 6;

// Grados de movilidad y furca para los selectores.
export const GRADE_OPTIONS = [0, 1, 2, 3] as const;
