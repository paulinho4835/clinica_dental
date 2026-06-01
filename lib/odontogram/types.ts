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
export const CONDITION_COLORS: Record<string, string> = {
  sano: "#ffffff",
  caries: "#ef4444",
  resina: "#3b82f6",
  amalgama: "#64748b",
  sellante: "#22c55e",
  fractura: "#f97316",
  corona: "#eab308",
  endodoncia: "#a855f7",
  implante: "#06b6d4",
  ausente: "#94a3b8",
  extraccion_indicada: "#dc2626",
  protesis: "#d946ef",
};

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
