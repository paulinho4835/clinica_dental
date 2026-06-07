import { describe, it, expect } from "vitest";
import {
  buildTimeline,
  mins,
  OPEN_HOUR,
  CLOSE_HOUR,
  STEP_MIN,
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
