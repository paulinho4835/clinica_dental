// Cuadrantes de la dentición TEMPORAL (dientes de leche), FDI 51-85.
// Mismo orden de despliegue que QUADRANTS (adultos) en lib/odontogram/types.ts:
// [sup. derecho, sup. izquierdo, inf. derecho, inf. izquierdo]. Cada cuadrante
// temporal tiene 5 dientes (2do molar, 1er molar, canino, lateral, central)
// en vez de los 8 de la dentición permanente.
export const PEDIATRIC_QUADRANTS: string[][] = [
  ["55", "54", "53", "52", "51"], // sup. derecho
  ["61", "62", "63", "64", "65"], // sup. izquierdo
  ["85", "84", "83", "82", "81"], // inf. derecho
  ["71", "72", "73", "74", "75"], // inf. izquierdo
];

// Números de cuadrante FDI a mostrar en las etiquetas, mismo orden de
// despliegue que usa Odontogram.tsx (top-left, top-right, bottom-left,
// bottom-right): temporal superior derecho=5, superior izquierdo=6,
// inferior izquierdo=7, inferior derecho=8.
export const PEDIATRIC_QUADRANT_NUMBERS: [number, number, number, number] = [5, 6, 8, 7];
