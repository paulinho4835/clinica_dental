import { describe, it, expect } from "vitest";
import {
  buildTimeline,
  mins,
  OPEN_HOUR,
  CLOSE_HOUR,
  STEP_MIN,
  blockGeometry,
  gridRange,
  weekDays,
  dentistColumns,
  assignLanes,
  type TimeAppt,
} from "@/lib/agenda";

const DAY = "2026-06-10";

// Fechas sin offset => se parsean en hora local, igual que `open`/`close` dentro
// de buildTimeline. Así el test es determinista en cualquier zona horaria.
const at = (hhmm: string) => `${DAY}T${hhmm}:00`;
const appt = (start: string, end: string | null): TimeAppt => ({
  starts_at: at(start),
  ends_at: end ? at(end) : null,
});

describe("mins", () => {
  it("calcula minutos entre dos instantes", () => {
    expect(mins(new Date(at("09:00")), new Date(at("10:00")))).toBe(60);
    expect(mins(new Date(at("09:00")), new Date(at("09:30")))).toBe(30);
  });
});

describe("buildTimeline", () => {
  it("día vacío => un solo hueco libre de apertura a cierre", () => {
    const segs = buildTimeline(DAY, []);
    expect(segs).toHaveLength(1);
    expect(segs[0].type).toBe("free");
    expect(segs[0].start.getHours()).toBe(OPEN_HOUR);
    expect(segs[0].end.getHours()).toBe(CLOSE_HOUR);
  });

  it("una cita produce hueco-ocupado-hueco", () => {
    const segs = buildTimeline(DAY, [appt("09:00", "10:00")]);
    expect(segs.map((s) => s.type)).toEqual(["free", "busy", "free"]);
    const busy = segs[1];
    expect(busy.start.getHours()).toBe(9);
    expect(busy.end.getHours()).toBe(10);
    if (busy.type === "busy") expect(busy.appts).toHaveLength(1);
  });

  it("fusiona citas solapadas en un solo bloque ocupado", () => {
    const segs = buildTimeline(DAY, [
      appt("09:00", "10:00"),
      appt("09:30", "11:00"),
    ]);
    const busy = segs.filter((s) => s.type === "busy");
    expect(busy).toHaveLength(1);
    expect(busy[0].start.getHours()).toBe(9);
    expect(busy[0].end.getHours()).toBe(11);
    if (busy[0].type === "busy") expect(busy[0].appts).toHaveLength(2);
  });

  it("fusiona citas que se tocan exactamente (fin == inicio)", () => {
    const segs = buildTimeline(DAY, [
      appt("09:00", "10:00"),
      appt("10:00", "11:00"),
    ]);
    const busy = segs.filter((s) => s.type === "busy");
    expect(busy).toHaveLength(1);
    if (busy[0].type === "busy") expect(busy[0].appts).toHaveLength(2);
  });

  it("ordena citas desordenadas por hora de inicio", () => {
    const segs = buildTimeline(DAY, [
      appt("15:00", "16:00"),
      appt("09:00", "10:00"),
    ]);
    const busy = segs.filter((s) => s.type === "busy");
    expect(busy).toHaveLength(2);
    expect(busy[0].start.getHours()).toBe(9);
    expect(busy[1].start.getHours()).toBe(15);
  });

  it("cita sin fin (ends_at null) dura STEP_MIN por defecto", () => {
    const segs = buildTimeline(DAY, [appt("09:00", null)]);
    const busy = segs.find((s) => s.type === "busy")!;
    expect(mins(busy.start, busy.end)).toBe(STEP_MIN);
  });

  it("no deja hueco libre al final si la última cita llega al cierre", () => {
    const segs = buildTimeline(DAY, [appt("19:00", "20:00")]);
    expect(segs[segs.length - 1].type).toBe("busy");
  });

  it("recorta el inicio de una cita previa a la apertura", () => {
    // El día arranca a las 08:00; una cita 07:00–09:00 no debe crear hueco antes.
    const segs = buildTimeline(DAY, [appt("07:00", "09:00")]);
    expect(segs[0].type).toBe("busy");
  });

  it("tres citas no solapadas generan el número correcto de segmentos", () => {
    const segs = buildTimeline(DAY, [
      appt("09:00", "10:00"),
      appt("11:00", "12:00"),
      appt("14:00", "15:00"),
    ]);
    const busySegs = segs.filter((s) => s.type === "busy");
    const freeSegs = segs.filter((s) => s.type === "free");
    expect(busySegs).toHaveLength(3);
    expect(freeSegs).toHaveLength(4); // antes, entre 1y2, entre 2y3, después
  });

  it("mins con misma fecha devuelve 0", () => {
    const d = new Date(at("10:00"));
    expect(mins(d, d)).toBe(0);
  });

  it("mins negativo cuando b < a", () => {
    expect(
      mins(new Date(at("10:00")), new Date(at("09:00")))
    ).toBe(-60);
  });

  it("cita que termina exactamente al cierre no deja hueco al final", () => {
    const segs = buildTimeline(DAY, [appt("18:00", "20:00")]);
    expect(segs[segs.length - 1].type).toBe("busy");
  });
});

describe("blockGeometry", () => {
  it("cita de día completo (08:00–20:00) ocupa todo el alto", () => {
    const g = blockGeometry(new Date(at("08:00")), new Date(at("20:00")));
    expect(g.top).toBeCloseTo(0, 5);
    expect(g.height).toBeCloseTo(1, 5);
  });

  it("cita 08:00–09:00 ocupa la primera 1/12 del día", () => {
    const g = blockGeometry(new Date(at("08:00")), new Date(at("09:00")));
    expect(g.top).toBeCloseTo(0, 5);
    expect(g.height).toBeCloseTo(1 / 12, 5);
  });

  it("cita 14:00–14:30 se posiciona a la mitad con alto de media hora", () => {
    const g = blockGeometry(new Date(at("14:00")), new Date(at("14:30")));
    expect(g.top).toBeCloseTo(6 / 12, 5); // 14:00 = 6h desde apertura
    expect(g.height).toBeCloseTo(0.5 / 12, 5);
  });

  it("recorta una cita que empieza antes de apertura", () => {
    const g = blockGeometry(new Date(at("07:00")), new Date(at("09:00")));
    expect(g.top).toBeCloseTo(0, 5);
    expect(g.height).toBeCloseTo(1 / 12, 5);
  });

  it("recorta una cita que termina después del cierre", () => {
    const g = blockGeometry(new Date(at("19:00")), new Date(at("21:00")));
    expect(g.top).toBeCloseTo(11 / 12, 5);
    expect(g.height).toBeCloseTo(1 / 12, 5);
  });

  // Regresión: la posición del bloque debe fijarse por la hora BOLIVIA de la
  // cita, sin importar el huso horario del dispositivo/servidor que ejecuta el
  // JS. Antes se usaba d.getHours()/getMinutes() (hora LOCAL del runtime): si
  // el dispositivo tenía un huso distinto a Bolivia, la cita se dibujaba en la
  // fila equivocada aunque la etiqueta de texto (que sí fuerza timeZone
  // "America/La_Paz") mostrara la hora correcta. Usamos timestamps con "Z"
  // (instante UTC inequívoco) para que el test no dependa del TZ del runner.
  it("posiciona por hora Bolivia, no por la hora local del runtime", () => {
    // 2026-06-10T20:00:00Z = 16:00 en Bolivia (UTC-4, sin horario de verano).
    const start = new Date("2026-06-10T20:00:00.000Z");
    const end = new Date("2026-06-10T21:00:00.000Z");
    const g = blockGeometry(start, end);
    expect(g.top).toBeCloseTo(8 / 12, 5); // 16:00 = 8h desde apertura (08:00)
    expect(g.height).toBeCloseTo(1 / 12, 5);
  });
});

describe("gridRange", () => {
  it("cubre 42 días empezando un lunes", () => {
    // Junio 2026: el 1 es lunes => la grilla arranca el 2026-06-01.
    const { start, end } = gridRange(new Date(2026, 5, 15));
    expect(start.getDay()).toBe(1); // lunes
    expect(Math.round((end.getTime() - start.getTime()) / 86_400_000)).toBe(42);
  });

  it("arranca el lunes de la semana que contiene el día 1", () => {
    // Julio 2026: el 1 es miércoles => la grilla arranca el lunes 2026-06-29.
    const { start } = gridRange(new Date(2026, 6, 10));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5); // junio
    expect(start.getDate()).toBe(29);
  });
});

describe("weekDays", () => {
  it("devuelve lunes..domingo de la semana que contiene la fecha", () => {
    // 2026-06-10 es miércoles.
    const days = weekDays(new Date(2026, 5, 10));
    expect(days).toHaveLength(7);
    expect(days[0].getDay()).toBe(1); // lunes
    expect(days[0].getDate()).toBe(8); // lun 8
    expect(days[6].getDay()).toBe(0); // domingo
    expect(days[6].getDate()).toBe(14); // dom 14
  });

  it("para un domingo devuelve la semana que termina ese domingo", () => {
    // 2026-06-14 es domingo.
    const days = weekDays(new Date(2026, 5, 14));
    expect(days[0].getDate()).toBe(8);
    expect(days[6].getDate()).toBe(14);
  });
});

describe("dentistColumns", () => {
  const a = (name: string | null) => ({ dentist_name: name });

  it("un solo odontólogo => una columna", () => {
    expect(dentistColumns([a("Dra. Paz"), a("Dra. Paz")])).toEqual(["Dra. Paz"]);
  });

  it("varios odontólogos => columnas ordenadas alfabéticamente", () => {
    expect(dentistColumns([a("Soto"), a("Paz"), a("Andrade")])).toEqual([
      "Andrade",
      "Paz",
      "Soto",
    ]);
  });

  it("nombres vacíos o null caen en 'Sin asignar'", () => {
    expect(dentistColumns([a(null), a("  ")])).toEqual(["Sin asignar"]);
  });

  it("día sin citas => sin columnas", () => {
    expect(dentistColumns([])).toEqual([]);
  });
});

describe("assignLanes", () => {
  it("citas que no se solapan van todas en la lane 0 (1 lane)", () => {
    const laid = assignLanes([appt("09:00", "10:00"), appt("10:00", "11:00")]);
    expect(laid.map((l) => l.lane)).toEqual([0, 0]);
    expect(laid.every((l) => l.lanes === 1)).toBe(true);
  });

  it("dos citas solapadas => lanes 0 y 1, ambas con lanes=2", () => {
    const laid = assignLanes([appt("09:00", "10:00"), appt("09:30", "10:30")]);
    expect(laid.map((l) => l.lane).sort()).toEqual([0, 1]);
    expect(laid.every((l) => l.lanes === 2)).toBe(true);
  });

  it("reusa una lane libre cuando una cita anterior ya terminó", () => {
    // A 09–10 y B 09:30–10:30 solapan (2 lanes). C 10:00–11:00 puede reusar
    // la lane de A. Las tres están en el mismo cluster (cadena solapada).
    const laid = assignLanes([
      appt("09:00", "10:00"),
      appt("09:30", "10:30"),
      appt("10:00", "11:00"),
    ]);
    expect(laid.every((l) => l.lanes === 2)).toBe(true);
  });

  it("preserva la cita original en el resultado", () => {
    const a = appt("09:00", "10:00");
    const laid = assignLanes([a]);
    expect(laid[0].appt).toBe(a);
    expect(laid[0]).toMatchObject({ lane: 0, lanes: 1 });
  });
});
