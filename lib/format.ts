// Formato de moneda: Boliviano (Bs). "Bs " es ASCII -> seguro para el PDF.
export function bs(n: number | null | undefined): string {
  return `Bs ${Number(n ?? 0).toFixed(2)}`;
}
