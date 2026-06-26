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

// Hora en Bolivia (HH:MM, 24h) a partir de un timestamp ISO.
export function fmtBoliviaTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-BO", {
    timeZone: BOLIVIA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Fecha de hoy en Bolivia como "YYYY-MM-DD" (en-CA produce ese formato ISO).
export function boliviaTodayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: BOLIVIA_TZ });
}

// Fecha + hora en Bolivia ("DD/MM/AAAA, HH:MM" en 24h). Se usa 24h a propósito:
// el formato 12h ("p. m.") mete un espacio especial (U+202F/U+00A0) antes del
// marcador que difiere entre la versión de ICU de Node y la del navegador, y eso
// rompe la hidratación de React. El 24h evita el marcador por completo y además
// es consistente con fmtBoliviaTime. Usar en componentes cliente con fecha-hora.
export function fmtBoliviaDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-BO", {
    timeZone: BOLIVIA_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
