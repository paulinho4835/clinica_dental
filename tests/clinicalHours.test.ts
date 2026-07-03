import { describe, it, expect } from "vitest";
import {
  getClinicalHours,
  withinClinicalHours,
  DEFAULT_CLINICAL_HOURS,
} from "@/lib/clinicalHours";

describe("getClinicalHours", () => {
  it("devuelve los valores por defecto cuando no hay settings", () => {
    expect(getClinicalHours(null)).toEqual(DEFAULT_CLINICAL_HOURS);
    expect(getClinicalHours(undefined)).toEqual(DEFAULT_CLINICAL_HOURS);
    expect(getClinicalHours({})).toEqual(DEFAULT_CLINICAL_HOURS);
  });

  it("enabled es true por defecto y solo false explícito lo apaga", () => {
    expect(getClinicalHours({ clinical_hours: {} }).enabled).toBe(true);
    expect(getClinicalHours({ clinical_hours: { enabled: false } }).enabled).toBe(false);
    // cualquier valor distinto de false se trata como activo
    expect(getClinicalHours({ clinical_hours: { enabled: 0 } }).enabled).toBe(true);
  });

  it("lee from/to cuando tienen formato HH:MM válido", () => {
    const ch = getClinicalHours({ clinical_hours: { from: "09:30", to: "18:15" } });
    expect(ch.from).toBe("09:30");
    expect(ch.to).toBe("18:15");
  });

  it("ignora from/to con formato inválido y cae al default", () => {
    const ch = getClinicalHours({ clinical_hours: { from: "9:30", to: "tarde" } });
    expect(ch.from).toBe(DEFAULT_CLINICAL_HOURS.from);
    expect(ch.to).toBe(DEFAULT_CLINICAL_HOURS.to);
  });

  it("tolera clinical_hours no-objeto sin romper", () => {
    expect(getClinicalHours({ clinical_hours: "nope" })).toEqual(DEFAULT_CLINICAL_HOURS);
  });
});

describe("withinClinicalHours", () => {
  it("siempre permite cuando el bloqueo está desactivado", () => {
    expect(withinClinicalHours({ clinical_hours: { enabled: false } })).toBe(true);
  });

  it("ventana de ancho cero (from === to) nunca permite (now>=from && now<to)", () => {
    // from<=to → now>=0 && now<0 es imposible.
    expect(withinClinicalHours({ clinical_hours: { from: "00:00", to: "00:00" } })).toBe(false);
  });

  it("devuelve un booleano para una ventana normal y una que cruza medianoche", () => {
    expect(typeof withinClinicalHours({ clinical_hours: { from: "08:00", to: "20:00" } })).toBe(
      "boolean",
    );
    expect(typeof withinClinicalHours({ clinical_hours: { from: "20:00", to: "08:00" } })).toBe(
      "boolean",
    );
  });
});
