// Formato de moneda: Boliviano (Bs). "Bs " es ASCII -> seguro para el PDF.
export function bs(n: number | null | undefined): string {
  return `Bs ${Number(n ?? 0).toFixed(2)}`;
}

// Iniciales (máx. 2) a partir de un nombre completo. Usado en avatares.
export function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// Normaliza texto para búsqueda: minúsculas y sin acentos ("María" -> "maria").
export function normalizeSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// Bolivia no tiene horario de verano (UTC-4 fijo). El server corre en UTC
// (Vercel), así que "hoy" debe calcularse explícitamente en zona Bolivia para
// no correrse un día por la noche.
export const BOLIVIA_TZ = "America/La_Paz";

// Fecha de hoy en Bolivia como "YYYY-MM-DD" (en-CA produce ese formato ISO).
export function boliviaTodayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: BOLIVIA_TZ });
}
