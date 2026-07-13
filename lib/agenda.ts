// Lógica pura de la agenda (sin React/DOM) para poder testearla aislada.

import { BOLIVIA_TZ } from "./format";

// ─── Config de la clínica ───────────────────────────────────────────────────
export const OPEN_HOUR = 8; // apertura
export const CLOSE_HOUR = 20; // cierre
export const STEP_MIN = 30; // duración por defecto de un bloque

// Minutos desde medianoche de `d` en la zona horaria de la clínica (Bolivia),
// sin depender del huso horario del dispositivo/navegador donde corre el JS.
// blockGeometry recibe instantes reales (Date de starts_at) y debe ubicarlos
// según la hora en que la clínica realmente opera: si el dispositivo tiene un
// huso horario distinto a Bolivia, usar getHours()/getMinutes() (hora LOCAL
// del dispositivo) dibuja la cita en la fila equivocada aunque la etiqueta de
// texto (que sí fuerza timeZone: "America/La_Paz") se vea con la hora correcta.
export function boliviaMinutesOfDay(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BOLIVIA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const mi = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + mi;
}

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
  const toMin = (d: Date) => boliviaMinutesOfDay(d) - OPEN_HOUR * 60;
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

// Los 7 días (lunes..domingo) de la semana que contiene `date`, en hora local.
export function weekDays(date: Date): Date[] {
  const offset = (date.getDay() + 6) % 7; // 0 = lunes
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

// Nombres distintos de odontólogo con cita ese día, ordenados alfabéticamente.
// Decide cuántas columnas dibuja la vista Día (0–1 => una columna ancha).
// Citas sin odontólogo caen en "Sin asignar".
export function dentistColumns<T extends { dentist_name: string | null }>(
  appts: T[],
): string[] {
  const names = new Set<string>();
  for (const a of appts) names.add(a.dentist_name?.trim() || "Sin asignar");
  return [...names].sort((x, y) => x.localeCompare(y, "es"));
}

// Reparte citas solapadas en "lanes" (sub-columnas) lado a lado para que ninguna
// quede tapada. Devuelve por cita su lane y el total de lanes de su grupo, de modo
// que el ancho de cada bloque sea 1/lanes. Agrupa en clusters de citas encadenadas
// por solapamiento y asigna greedily la primera lane libre.
export type Laid<T> = { appt: T; lane: number; lanes: number };

export function assignLanes<T extends TimeAppt>(appts: T[]): Laid<T>[] {
  const defMs = STEP_MIN * 60_000;
  const items = appts
    .map((a) => {
      const s = new Date(a.starts_at).getTime();
      const e = a.ends_at ? new Date(a.ends_at).getTime() : s + defMs;
      return { a, s, e };
    })
    .sort((x, y) => x.s - y.s || x.e - y.e);

  const result: Laid<T>[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const laneEnds: number[] = []; // fin de la última cita en cada lane
    const assigned: { a: T; lane: number }[] = [];
    for (const it of cluster) {
      let lane = laneEnds.findIndex((end) => end <= it.s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(it.e);
      } else {
        laneEnds[lane] = it.e;
      }
      assigned.push({ a: it.a, lane });
    }
    const lanes = laneEnds.length;
    for (const x of assigned) result.push({ appt: x.a, lane: x.lane, lanes });
    cluster = [];
  };

  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return result;
}
