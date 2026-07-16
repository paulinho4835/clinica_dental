import { describe, expect, it } from "vitest";
import {
  boliviaWeekdayOf,
  blocksForDay,
  blockRange,
  findAvailabilityConflict,
  type AvailabilityBlock,
} from "@/lib/availability";

const base = {
  id: "b1",
  dentist_id: "d1",
  dentist_name: "Ana Pérez",
  weekday: null as number | null,
  date_from: null as string | null,
  date_to: null as string | null,
  start_time: "09:00",
  end_time: "13:00",
  reason: null as string | null,
};

describe("boliviaWeekdayOf", () => {
  it("0 = lunes", () => {
    expect(boliviaWeekdayOf("2026-07-13")).toBe(0); // lunes
    expect(boliviaWeekdayOf("2026-07-16")).toBe(3); // jueves
    expect(boliviaWeekdayOf("2026-07-19")).toBe(6); // domingo
  });
});

describe("blocksForDay", () => {
  const weekly: AvailabilityBlock = { ...base, weekday: 0 }; // lunes
  const dated: AvailabilityBlock = {
    ...base,
    id: "b2",
    date_from: "2026-08-01",
    date_to: "2026-08-10",
  };

  it("matchea el semanal solo en su día de semana", () => {
    expect(blocksForDay("2026-07-13", [weekly])).toEqual([weekly]); // lunes
    expect(blocksForDay("2026-07-14", [weekly])).toEqual([]);       // martes
  });

  it("matchea el rango de fechas inclusive en los bordes", () => {
    expect(blocksForDay("2026-08-01", [dated])).toEqual([dated]);
    expect(blocksForDay("2026-08-10", [dated])).toEqual([dated]);
    expect(blocksForDay("2026-08-11", [dated])).toEqual([]);
    expect(blocksForDay("2026-07-31", [dated])).toEqual([]);
  });

  it("normaliza HH:MM:SS de postgres", () => {
    const pg = { ...base, weekday: 0, start_time: "09:00:00", end_time: "13:00:00" };
    const [b] = blocksForDay("2026-07-13", [pg]);
    expect(blockRange("2026-07-13", b).start.toISOString()).toBe(
      new Date("2026-07-13T09:00:00-04:00").toISOString(),
    );
  });
});

describe("blockRange", () => {
  it("construye instantes en hora Bolivia (-04:00), no del dispositivo", () => {
    const { start, end } = blockRange("2026-07-13", { ...base, weekday: 0 });
    expect(start.toISOString()).toBe(new Date("2026-07-13T09:00:00-04:00").toISOString());
    expect(end.toISOString()).toBe(new Date("2026-07-13T13:00:00-04:00").toISOString());
  });
});

describe("findAvailabilityConflict", () => {
  const weekly: AvailabilityBlock = { ...base, weekday: 0, reason: "No viene" }; // lunes 9-13

  it("detecta solapamiento parcial (cita 08:30-09:30)", () => {
    const s = new Date("2026-07-13T08:30:00-04:00");
    const e = new Date("2026-07-13T09:30:00-04:00");
    expect(findAvailabilityConflict("2026-07-13", s, e, "Ana Pérez", [weekly])?.id).toBe("b1");
  });

  it("sin conflicto si la cita toca el borde exacto (13:00-14:00)", () => {
    const s = new Date("2026-07-13T13:00:00-04:00");
    const e = new Date("2026-07-13T14:00:00-04:00");
    expect(findAvailabilityConflict("2026-07-13", s, e, "Ana Pérez", [weekly])).toBeNull();
  });

  it("sin conflicto para otro doctor u otro día", () => {
    const s = new Date("2026-07-13T10:00:00-04:00");
    const e = new Date("2026-07-13T11:00:00-04:00");
    expect(findAvailabilityConflict("2026-07-13", s, e, "Luis Rojas", [weekly])).toBeNull();
    const mar = new Date("2026-07-14T10:00:00-04:00");
    const marE = new Date("2026-07-14T11:00:00-04:00");
    expect(findAvailabilityConflict("2026-07-14", mar, marE, "Ana Pérez", [weekly])).toBeNull();
  });

  it("sin nombre de doctor no hay conflicto (no es atribuible)", () => {
    const s = new Date("2026-07-13T10:00:00-04:00");
    const e = new Date("2026-07-13T11:00:00-04:00");
    expect(findAvailabilityConflict("2026-07-13", s, e, null, [weekly])).toBeNull();
  });
});
