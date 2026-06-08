// Lógica pura de la agenda (sin React/DOM) para poder testearla aislada.

// ─── Config de la clínica ───────────────────────────────────────────────────
export const OPEN_HOUR = 8; // apertura
export const CLOSE_HOUR = 20; // cierre
export const STEP_MIN = 30; // duración por defecto de un bloque

// Minutos entre dos instantes (redondeado).
export const mins = (a: Date, b: Date) =>
  Math.round((b.getTime() - a.getTime()) / 60_000);

// Entrada mínima que necesita la línea de tiempo. Cualquier cita la cumple.
export type TimeAppt = { starts_at: string; ends_at: string | null };

export type Segment<T extends TimeAppt> =
  | { type: "free"; start: Date; end: Date }
  | { type: "busy"; start: Date; end: Date; appts: T[] };

// Construye la línea de tiempo dinámica de un día:
// fusiona citas solapadas en bloques ocupados y fragmenta los huecos libres
// entre el horario de apertura/cierre y cada cita.
export function buildTimeline<T extends TimeAppt>(
  day: string,
  appts: T[],
): Segment<T>[] {
  const [y, m, d] = day.split("-").map(Number);
  const open = new Date(y, m - 1, d, OPEN_HOUR, 0);
  const close = new Date(y, m - 1, d, CLOSE_HOUR, 0);
  const defMs = STEP_MIN * 60_000;

  // Normaliza y ordena las citas por inicio.
  const sorted = appts
    .map((a) => {
      const s = new Date(a.starts_at);
      const e = a.ends_at ? new Date(a.ends_at) : new Date(s.getTime() + defMs);
      return { a, s, e };
    })
    .sort((x, y2) => x.s.getTime() - y2.s.getTime());

  // Fusiona citas que se solapan o tocan en bloques ocupados.
  const busy: { start: Date; end: Date; appts: T[] }[] = [];
  for (const { a, s, e } of sorted) {
    const last = busy[busy.length - 1];
    if (last && s.getTime() <= last.end.getTime()) {
      if (e > last.end) last.end = e;
      last.appts.push(a);
    } else {
      busy.push({ start: new Date(s), end: new Date(e), appts: [a] });
    }
  }

  // Recorre el día insertando huecos libres entre bloques ocupados.
  const segs: Segment<T>[] = [];
  let cursor = open;
  for (const b of busy) {
    const visStart = b.start < open ? open : b.start; // recorta al horario
    if (visStart > cursor) segs.push({ type: "free", start: cursor, end: visStart });
    segs.push({ type: "busy", start: b.start, end: b.end, appts: b.appts });
    if (b.end > cursor) cursor = b.end;
  }
  if (cursor < close) segs.push({ type: "free", start: cursor, end: close });
  return segs;
}

// ─── Geometría de un bloque dentro del eje de horas (fracciones 0..1) ────────
// Devuelve la posición vertical (top) y la altura como fracción del día visible
// [OPEN_HOUR, CLOSE_HOUR]. El componente las multiplica por su alto en píxeles.
// Recorta citas que se salen del horario para que nunca desborden.
export type BlockGeom = { top: number; height: number };

export function blockGeometry(start: Date, end: Date): BlockGeom {
  const total = (CLOSE_HOUR - OPEN_HOUR) * 60;
  const toMin = (d: Date) => d.getHours() * 60 + d.getMinutes() - OPEN_HOUR * 60;
  const s = Math.max(0, Math.min(total, toMin(start)));
  const e = Math.max(0, Math.min(total, toMin(end)));
  return { top: s / total, height: Math.max(0, (e - s) / total) };
}

// Rango [inicio, fin) que cubre la grilla de 6 semanas (42 días, lunes primero)
// del mes que contiene `date`. Se usa para traer las citas del server: así la
// vista Semana en el borde de mes no aparece vacía.
export function gridRange(date: Date): { start: Date; end: Date } {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7; // 0 = lunes
  const start = new Date(date.getFullYear(), date.getMonth(), 1 - offset);
  const end = new Date(start);
  end.setDate(start.getDate() + 42);
  return { start, end };
}
