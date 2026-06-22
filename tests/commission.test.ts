import { describe, it, expect } from "vitest";
import { computeCommission, netRate } from "@/lib/commission";

describe("netRate", () => {
  it("es 1 cuando no hay costo registrado (evita división por cero)", () => {
    expect(netRate(0, 0)).toBe(1);
    expect(netRate(0, 500)).toBe(1);
  });

  it("descuenta el laboratorio proporcionalmente", () => {
    // cost=2500, lab=1000 → neto = 1500/2500 = 0.6
    expect(netRate(2500, 1000)).toBeCloseTo(0.6, 5);
  });

  it("nunca es negativo aunque lab supere el costo", () => {
    expect(netRate(1000, 5000)).toBe(0);
  });

  it("es 1 cuando no hay costo de laboratorio", () => {
    expect(netRate(2000, 0)).toBe(1);
  });
});

describe("computeCommission (espejo de la columna generada, migración 0045)", () => {
  it("caso simple sin lab: 40% de lo cobrado", () => {
    expect(computeCommission({ amountPaid: 1000, cost: 1000, labCost: 0, pct: 40 })).toBe(400);
  });

  it("ejemplo de la migración: corona cost=2500 lab=1000, cuota 500 → Bs 120", () => {
    // 500 × (1500/2500) × 40% = 500 × 0.6 × 0.4 = 120
    expect(computeCommission({ amountPaid: 500, cost: 2500, labCost: 1000, pct: 40 })).toBe(120);
  });

  it("cuota parcial menor al costo de lab SIGUE generando comisión (bug 0044 corregido)", () => {
    // Antes daba 0; ahora 300 × 0.6 × 0.4 = 72
    const c = computeCommission({ amountPaid: 300, cost: 2500, labCost: 1000, pct: 40 });
    expect(c).toBeGreaterThan(0);
    expect(c).toBeCloseTo(72, 2);
  });

  it("sin costo registrado usa la cuota directa", () => {
    expect(computeCommission({ amountPaid: 800, cost: 0, labCost: 0, pct: 50 })).toBe(400);
  });

  it("redondea a 2 decimales", () => {
    // 333.33 × 1 × 40% = 133.332 → 133.33
    expect(computeCommission({ amountPaid: 333.33, cost: 0, labCost: 0, pct: 40 })).toBe(133.33);
  });

  it("pct 0 → comisión 0", () => {
    expect(computeCommission({ amountPaid: 1000, cost: 1000, labCost: 0, pct: 0 })).toBe(0);
  });

  it("tolera entradas no numéricas (NaN) tratándolas como 0", () => {
    expect(computeCommission({ amountPaid: NaN, cost: 1000, labCost: 0, pct: 40 })).toBe(0);
  });
});
