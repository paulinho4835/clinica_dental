// Modelo del odontograma SIN imágenes: todo es dato estructurado (JSONB en Postgres).
export type Surface = "O" | "M" | "D" | "V" | "L"; // Oclusal, Mesial, Distal, Vestibular, Lingual/Palatino

export type SurfaceState = string; // code de dental_condition_catalog (scope='surface')
export type WholeState = string | null; // code (scope='whole') o null

export interface ToothState {
  present: boolean;
  whole: WholeState;
  surfaces: Partial<Record<Surface, SurfaceState>>;
}

// teeth: mapa numeración FDI -> estado del diente
export type TeethMap = Record<string, ToothState>;

// Marca X de diente completo, según convención odontológica:
//   rojo = tratamiento requerido / patología
//   azul = existente / ya realizado
// El número FDI marca/desmarca esta X con el color activo de la barra.
export type MarkColor = "rojo" | "azul";

export const MARK_COLORS: Record<MarkColor, string> = {
  rojo: "#dc2626",
  azul: "#2563eb",
};

export const MARK_LABELS: Record<MarkColor, string> = {
  rojo: "Requerido",
  azul: "Existente",
};

// Código de estado whole para cada marca: "x_rojo" | "x_azul".
export function markWhole(color: MarkColor): string {
  return `x_${color}`;
}

// Si un estado whole es una marca X, devuelve su color de render; si no, null.
export function markColorOf(whole: string | null | undefined): string | null {
  if (whole === "x_rojo") return MARK_COLORS.rojo;
  if (whole === "x_azul") return MARK_COLORS.azul;
  return null;
}

// Colores por defecto (espejo de dental_condition_catalog del seed).
// `sano` usa una variable CSS para adaptarse a modo claro/oscuro; el resto son
// colores clínicos fijos (su significado es universal).
export const CONDITION_COLORS: Record<string, string> = {
  sano: "var(--tooth-healthy)",
  caries: "#ef4444",
  caries_recidivante: "#78350f",
  resina: "#3b82f6",
  amalgama: "#64748b",
  sellante: "#22c55e",
  fractura: "#f97316",
  desgaste: "#a16207",
  corona: "#eab308",
  endodoncia: "#a855f7",
  perno: "#6366f1",
  implante: "#06b6d4",
  ausente: "#94a3b8",
  extraccion_indicada: "#dc2626",
  protesis: "#d946ef",
  movilidad: "#ec4899",
  en_erupcion: "#0d9488",
};

// Etiquetas legibles para paleta y leyenda.
export const CONDITION_LABELS: Record<string, string> = {
  sano: "Sano",
  caries: "Caries",
  caries_recidivante: "Caries recidivante",
  resina: "Resina",
  amalgama: "Amalgama",
  sellante: "Sellante",
  fractura: "Fractura",
  desgaste: "Desgaste / abrasión",
  corona: "Corona",
  endodoncia: "Endodoncia",
  perno: "Perno muñón",
  implante: "Implante",
  ausente: "Ausente",
  extraccion_indicada: "Extracción indicada",
  protesis: "Prótesis",
  movilidad: "Movilidad",
  en_erupcion: "En erupción / incluido",
};

// Condiciones que se pintan en UNA cara del diente (scope = surface).
export const SURFACE_CONDITIONS = [
  "caries",
  "caries_recidivante",
  "resina",
  "amalgama",
  "sellante",
  "fractura",
  "desgaste",
] as const;

// Condiciones que afectan al DIENTE COMPLETO (scope = whole).
export const WHOLE_CONDITIONS = [
  "corona",
  "endodoncia",
  "perno",
  "implante",
  "protesis",
  "extraccion_indicada",
  "ausente",
  "movilidad",
  "en_erupcion",
] as const;

// Tipo anatómico según el segundo dígito FDI (1-2 incisivo, 3 canino,
// 4-5 premolar, 6-8 molar). Define la forma del diente en el dibujo.
export type ToothType = "incisor" | "canine" | "premolar" | "molar";

export function toothType(fdi: string): ToothType {
  const n = Number(fdi[1]);
  if (n >= 6) return "molar";
  if (n >= 4) return "premolar";
  if (n === 3) return "canine";
  return "incisor";
}

// Anteriores (incisivos y caninos) no tienen cara oclusal: se dibujan
// redondeados; los posteriores como cuadrado con cara oclusal central.
export function isAnterior(fdi: string): boolean {
  return Number(fdi[1]) <= 3;
}

// Dentición permanente, ordenada por cuadrantes (FDI).
export const QUADRANTS: string[][] = [
  ["18", "17", "16", "15", "14", "13", "12", "11"], // sup. derecho
  ["21", "22", "23", "24", "25", "26", "27", "28"], // sup. izquierdo
  ["48", "47", "46", "45", "44", "43", "42", "41"], // inf. derecho
  ["31", "32", "33", "34", "35", "36", "37", "38"], // inf. izquierdo
];

export function colorFor(state: string | undefined | null): string {
  if (!state) return CONDITION_COLORS.sano;
  return CONDITION_COLORS[state] ?? CONDITION_COLORS.sano;
}
