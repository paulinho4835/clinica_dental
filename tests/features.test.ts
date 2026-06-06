import { describe, it, expect } from "vitest";
import { normalizeFeatures, isEnabled } from "@/lib/features";

describe("normalizeFeatures", () => {
  it("módulos ausentes se asumen encendidos (no romper clínicas viejas)", () => {
    const f = normalizeFeatures({});
    expect(f.agenda).toBe(true);
    expect(f.pacientes).toBe(true);
    expect(f.caja).toBe(true);
  });

  it("solo false explícito apaga un módulo", () => {
    const f = normalizeFeatures({ caja: false, agenda: true });
    expect(f.caja).toBe(false);
    expect(f.agenda).toBe(true);
  });

  it("ajustes es core: no se puede apagar ni con false", () => {
    const f = normalizeFeatures({ ajustes: false });
    expect(f.ajustes).toBe(true);
  });

  it("tolera entradas nulas/no-objeto", () => {
    expect(normalizeFeatures(null).pacientes).toBe(true);
    expect(normalizeFeatures(undefined).pacientes).toBe(true);
  });

  it("isEnabled refleja el mapa normalizado", () => {
    const f = normalizeFeatures({ inventario: false });
    expect(isEnabled(f, "inventario")).toBe(false);
    expect(isEnabled(f, "agenda")).toBe(true);
  });
});
