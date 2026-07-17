import { describe, it, expect } from "vitest";
import { freeSlotsForDay, formatFreeSlotsMessage } from "@/lib/freeSlots";
import type { AvailabilityBlock } from "@/lib/availability";

function block(overrides: Partial<AvailabilityBlock> = {}): AvailabilityBlock {
  return {
    id: "b1",
    dentist_id: "doc-1",
    dentist_name: "Dr. Gómez",
    weekday: null,
    date_from: null,
    date_to: null,
    start_time: "09:00",
    end_time: "10:00",
    reason: null,
    ...overrides,
  };
}

// 2026-06-15 es lunes (grilla completa 09:00-19:00, ver tests/vapi-helpers.test.ts).
const MONDAY = "2026-06-15";
// 2026-06-14 es domingo (grilla reducida 09:00-11:00).
const SUNDAY = "2026-06-14";

describe("freeSlotsForDay", () => {
  it("excluye los slots que solapan una cita reservada (60 min)", () => {
    const booked = [
      {
        start: new Date(`${MONDAY}T09:00:00-04:00`).getTime(),
        end: new Date(`${MONDAY}T10:00:00-04:00`).getTime(),
      },
    ];
    const slots = freeSlotsForDay(MONDAY, booked, [], "Dr. Gómez");
    expect(slots).not.toContain("09:00");
    expect(slots).not.toContain("09:30");
    expect(slots).toContain("10:00"); // borde exacto: no bloquea
  });

  it("excluye los slots cubiertos por un bloque de no disponibilidad del doctor", () => {
    const blocks = [block({ date_from: MONDAY, date_to: MONDAY })];
    const slots = freeSlotsForDay(MONDAY, [], blocks, "Dr. Gómez");
    expect(slots).not.toContain("09:00");
    expect(slots).not.toContain("09:30");
    expect(slots).toContain("10:00");
  });

  it("ignora bloques de OTRO doctor", () => {
    const blocks = [
      block({ date_from: MONDAY, date_to: MONDAY, dentist_name: "Dra. Pérez" }),
    ];
    const slots = freeSlotsForDay(MONDAY, [], blocks, "Dr. Gómez");
    expect(slots).toContain("09:00");
  });

  it("sin citas ni bloques, devuelve la grilla completa del día", () => {
    const slots = freeSlotsForDay(MONDAY, [], [], "Dr. Gómez");
    expect(slots).toHaveLength(21);
  });

  it("domingo usa la grilla reducida (09:00-11:00)", () => {
    const slots = freeSlotsForDay(SUNDAY, [], [], "Dr. Gómez");
    expect(slots).toEqual(["09:00", "09:30", "10:00", "10:30", "11:00"]);
  });
});

describe("formatFreeSlotsMessage", () => {
  it("un día con horarios: encabezado + línea con emoji y negrita", () => {
    const text = formatFreeSlotsMessage([
      { dateISO: MONDAY, label: "Lunes 15", slots: ["09:00", "09:30"] },
    ]);
    expect(text).toBe(
      "Estos son los horarios disponibles para programar su cita:\n\n" +
        "✨ *Lunes 15:* 09:00 | 09:30",
    );
  });

  it("varios días: uno por línea", () => {
    const text = formatFreeSlotsMessage([
      { dateISO: "2026-06-15", label: "Lunes 15", slots: ["09:00"] },
      { dateISO: "2026-06-16", label: "Martes 16", slots: ["10:00", "10:30"] },
    ]);
    expect(text).toContain("✨ *Lunes 15:* 09:00");
    expect(text).toContain("✨ *Martes 16:* 10:00 | 10:30");
  });

  it("omite los días sin horarios libres", () => {
    const text = formatFreeSlotsMessage([
      { dateISO: "2026-06-15", label: "Lunes 15", slots: [] },
      { dateISO: "2026-06-16", label: "Martes 16", slots: ["10:00"] },
    ]);
    expect(text).not.toContain("Lunes 15");
    expect(text).toContain("Martes 16");
  });

  it("si ningún día tiene horarios, devuelve el mensaje de fallback", () => {
    const text = formatFreeSlotsMessage([
      { dateISO: "2026-06-15", label: "Lunes 15", slots: [] },
      { dateISO: "2026-06-16", label: "Martes 16", slots: [] },
    ]);
    expect(text).toBe("No hay horarios disponibles en los próximos 2 días.");
  });
});
