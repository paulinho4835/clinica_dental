import { normalizeSearch } from "@/lib/format";

// Reglas únicas de búsqueda de pacientes, compartidas por todos los buscadores
// (Pacientes, Cuentas, Agenda, Mis trabajos). Coinciden con la RPC
// search_agenda_patients (0126): sin acentos ni mayúsculas, cada palabra debe
// aparecer ("maria gomez" encuentra a "María Elena Gómez"), y se ignoran comas
// y puntos ("Pérez, José", CI "4.835.946").

// Términos listos para usar en filtros .ilike() de PostgREST: se quitan los
// comodines de LIKE (% _ y su escape \) y el alias * de PostgREST, así ningún
// texto escrito cambia el patrón. Nunca se interpolan en .or(): ahí comas y
// paréntesis sí romperían la sintaxis.
export function patientSearchTerms(query: string): string[] {
  return normalizeSearch(query)
    .replace(/[.,]/g, "")
    .replace(/[%_*\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Si lo escrito es un teléfono (solo dígitos, espacios, guiones o +, con al
// menos 3 dígitos), devuelve los dígitos; si no, null.
export function patientPhoneDigits(query: string): string | null {
  const trimmed = query.trim();
  if (!/^\+?[\d\s-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length >= 3 ? digits : null;
}

// Versión en memoria para listas que ya están en el navegador.
export function matchesPatientSearch(text: string, query: string): boolean {
  const haystack = normalizeSearch(text).replace(/[.,]/g, "");
  return patientSearchTerms(query).every((term) => haystack.includes(term));
}

type SearchableQuery<T> = {
  ilike(column: string, pattern: string): T;
  or(filters: string): T;
};

// Aplica la búsqueda a una consulta de `patients` (columna search_text = nombre
// + CI sin acentos, 0008). Con `phone`, una búsqueda numérica también busca en
// el teléfono; en ese caso el texto ya son solo dígitos y es seguro dentro de
// .or(). Sin términos válidos no filtra nada.
export function applyPatientSearch<T extends SearchableQuery<T>>(
  query: T,
  text: string,
  opts: { phone?: boolean } = {},
): T {
  const digits = opts.phone ? patientPhoneDigits(text) : null;
  if (digits) return query.or(`search_text.ilike.%${digits}%,phone.ilike.%${digits}%`);
  return patientSearchTerms(text).reduce(
    (acc, term) => acc.ilike("search_text", `%${term}%`),
    query,
  );
}
