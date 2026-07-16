// Lógica pura de disponibilidad de doctores (addon "disponibilidad").
// Un AvailabilityBlock es un rango donde el doctor NO atiende: semanal
// recurrente (weekday 0=lunes) o por fechas (date_from..date_to inclusive).
// Sin React/DOM para poder testearla aislada (mismo criterio que lib/agenda.ts).

export type AvailabilityBlock = {
  id: string;
  dentist_id: string;
  dentist_name: string;
  weekday: number | null;
  date_from: string | null;
  date_to: string | null;
  start_time: string; // "HH:MM" o "HH:MM:SS" (postgres time)
  end_time: string;
  reason: string | null;
};

// Día de semana de una fecha-calendario YYYY-MM-DD con 0=lunes…6=domingo.
// La fecha es de calendario (no un instante), así que el cálculo es puro.
export function boliviaWeekdayOf(dayISO: string): number {
  const [y, m, d] = dayISO.split("-").map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

const hhmm = (t: string) => t.slice(0, 5);

// Bloques que aplican a un día concreto (semanales por weekday + por fechas).
export function blocksForDay(
  dayISO: string,
  blocks: AvailabilityBlock[],
): AvailabilityBlock[] {
  const wd = boliviaWeekdayOf(dayISO);
  return blocks.filter((b) => {
    if (b.weekday !== null) return b.weekday === wd;
    if (b.date_from && b.date_to) return b.date_from <= dayISO && dayISO <= b.date_to;
    return false;
  });
}

// Instantes reales del bloque en un día dado, en hora Bolivia (-04:00) para no
// depender del huso del dispositivo (mismo criterio que boliviaMinutesOfDay).
export function blockRange(
  dayISO: string,
  b: AvailabilityBlock,
): { start: Date; end: Date } {
  return {
    start: new Date(`${dayISO}T${hhmm(b.start_time)}:00-04:00`),
    end: new Date(`${dayISO}T${hhmm(b.end_time)}:00-04:00`),
  };
}

// Primer bloque del doctor que se solapa con [start, end). Bordes exactos no
// chocan (cita 13:00 con bloque hasta 13:00 = ok). Sin doctor no es atribuible.
export function findAvailabilityConflict(
  dayISO: string,
  start: Date,
  end: Date,
  dentistName: string | null | undefined,
  blocks: AvailabilityBlock[],
): AvailabilityBlock | null {
  const name = dentistName?.trim();
  if (!name) return null;
  for (const b of blocksForDay(dayISO, blocks)) {
    if (b.dentist_name.trim() !== name) continue;
    const r = blockRange(dayISO, b);
    if (r.start < end && r.end > start) return b;
  }
  return null;
}
