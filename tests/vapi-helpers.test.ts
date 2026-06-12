import { describe, it, expect } from "vitest";
import {
  parseArgs,
  normalizeTime,
  normalizeDate,
  normalizeVapiPhone,
  buildSlots,
} from "@/lib/vapi-helpers";

// ─── parseArgs ────────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("acepta objeto JS directo (formato real de Vapi)", () => {
    const obj = { action: "confirm", phone: "71234567" };
    expect(parseArgs(obj)).toEqual(obj);
  });

  it("parsea string JSON correctamente", () => {
    const str = JSON.stringify({ action: "cancel" });
    expect(parseArgs(str)).toEqual({ action: "cancel" });
  });

  it("devuelve {} cuando el string JSON es inválido", () => {
    expect(parseArgs("no es json")).toEqual({});
    expect(parseArgs("{mal json")).toEqual({});
  });

  it("devuelve {} para null, undefined y string vacío", () => {
    expect(parseArgs(null)).toEqual({});
    expect(parseArgs(undefined)).toEqual({});
    expect(parseArgs("")).toEqual({});
  });

  it("devuelve {} para tipos inesperados", () => {
    expect(parseArgs(42)).toEqual({});
    expect(parseArgs(true)).toEqual({});
  });
});

// ─── normalizeTime ────────────────────────────────────────────────────────────

describe("normalizeTime", () => {
  it("pasa HH:MM de 24h sin cambios", () => {
    expect(normalizeTime("14:00")).toBe("14:00");
    expect(normalizeTime("09:30")).toBe("09:30");
    expect(normalizeTime("00:00")).toBe("00:00");
  });

  it("agrega cero inicial a hora simple", () => {
    expect(normalizeTime("9:00")).toBe("09:00");
    expect(normalizeTime("2:30")).toBe("02:30");
  });

  it("convierte PM correctamente", () => {
    expect(normalizeTime("2:00 pm")).toBe("14:00");
    expect(normalizeTime("2:00pm")).toBe("14:00");
    expect(normalizeTime("12:00 pm")).toBe("12:00"); // mediodía
  });

  it("convierte AM correctamente", () => {
    expect(normalizeTime("2:00 am")).toBe("02:00");
    expect(normalizeTime("12:00 am")).toBe("00:00"); // medianoche
  });

  it("acepta formato h:mm (hora dictada sin cero)", () => {
    expect(normalizeTime("2:00")).toBe("02:00");
    expect(normalizeTime("9:45")).toBe("09:45");
  });

  it("acepta formato 9h30 (dictado latinoamericano)", () => {
    expect(normalizeTime("9h30")).toBe("09:30");
    expect(normalizeTime("14h00")).toBe("14:00");
  });

  it("acepta solo la hora entera", () => {
    expect(normalizeTime("14")).toBe("14:00");
    expect(normalizeTime("9")).toBe("09:00");
  });

  it("acepta hora entera con am/pm", () => {
    expect(normalizeTime("2 pm")).toBe("14:00");
    expect(normalizeTime("2 am")).toBe("02:00");
  });

  it("devuelve null para valores imposibles", () => {
    expect(normalizeTime("25:00")).toBeNull();
    expect(normalizeTime("10:60")).toBeNull();
  });

  it("devuelve null para texto no reconocible", () => {
    expect(normalizeTime("mañana")).toBeNull();
    expect(normalizeTime("")).toBeNull();
  });
});

// ─── normalizeDate ────────────────────────────────────────────────────────────

describe("normalizeDate", () => {
  it("pasa YYYY-MM-DD sin cambios", () => {
    expect(normalizeDate("2026-06-15")).toBe("2026-06-15");
  });

  it("convierte DD/MM/YYYY (formato boliviano)", () => {
    expect(normalizeDate("15/06/2026")).toBe("2026-06-15");
    expect(normalizeDate("1/6/2026")).toBe("2026-06-01");
  });

  it("convierte DD-MM-YYYY (con guiones)", () => {
    expect(normalizeDate("15-06-2026")).toBe("2026-06-15");
  });

  it("agrega ceros a día y mes de un dígito", () => {
    expect(normalizeDate("5/6/2026")).toBe("2026-06-05");
  });

  it("devuelve null para formatos no reconocibles", () => {
    expect(normalizeDate("15 junio 2026")).toBeNull();
    expect(normalizeDate("mañana")).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });
});

// ─── normalizeVapiPhone ───────────────────────────────────────────────────────

describe("normalizeVapiPhone", () => {
  it("strip el + y devuelve dígitos para número con código de país", () => {
    expect(normalizeVapiPhone("+59171234567")).toBe("59171234567");
    expect(normalizeVapiPhone("+59167891234")).toBe("59167891234");
  });

  it("agrega código 591 a números bolivianos de 8 dígitos con 7", () => {
    expect(normalizeVapiPhone("71234567")).toBe("59171234567");
  });

  it("agrega código 591 a números bolivianos de 8 dígitos con 6", () => {
    expect(normalizeVapiPhone("67891234")).toBe("59167891234");
  });

  it("no agrega 591 a números de 8 dígitos que no empiezan con 6 o 7", () => {
    // 8 dígitos empezando con 5 — no es boliviano móvil → null
    expect(normalizeVapiPhone("51234567")).toBeNull();
  });

  it("acepta número con espacios/guiones (los elimina)", () => {
    expect(normalizeVapiPhone("+591 71234567")).toBe("59171234567");
    expect(normalizeVapiPhone("7 123 45 67")).toBe("59171234567");
  });

  it("devuelve null para string vacío", () => {
    expect(normalizeVapiPhone("")).toBeNull();
  });

  it("devuelve null para string sin dígitos", () => {
    expect(normalizeVapiPhone("abc")).toBeNull();
  });

  it("devuelve null para número demasiado corto (no 8 dígitos boliviano ni ≥10)", () => {
    expect(normalizeVapiPhone("123")).toBeNull();
  });
});

// ─── buildSlots ───────────────────────────────────────────────────────────────

describe("buildSlots", () => {
  // 2026-06-15 es lunes
  it("lunes genera 11 slots de 09:00 a 19:00", () => {
    const slots = buildSlots("2026-06-15");
    expect(slots).toHaveLength(11);
    expect(slots[0]).toBe("09:00");
    expect(slots[slots.length - 1]).toBe("19:00");
  });

  // 2026-06-13 es sábado
  it("sábado genera 11 slots igual que entre semana", () => {
    const slots = buildSlots("2026-06-13");
    expect(slots).toHaveLength(11);
    expect(slots[0]).toBe("09:00");
  });

  // 2026-06-14 es domingo
  it("domingo genera solo 3 slots: 09:00, 10:00, 11:00", () => {
    const slots = buildSlots("2026-06-14");
    expect(slots).toEqual(["09:00", "10:00", "11:00"]);
  });

  it("todos los slots tienen formato HH:MM", () => {
    const slots = buildSlots("2026-06-15");
    for (const s of slots) {
      expect(s).toMatch(/^\d{2}:\d{2}$/);
    }
  });
});
