import { describe, it, expect } from "vitest";
import { normalizeFeatures, isEnabled, FEATURES } from "@/lib/features";

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

  it("todos los módulos non-core se pueden apagar individualmente", () => {
    const all = normalizeFeatures({
      agenda: false,
      pacientes: false,
      caja: false,
      inventario: false,
    });
    expect(all.agenda).toBe(false);
    expect(all.pacientes).toBe(false);
    expect(all.caja).toBe(false);
    expect(all.inventario).toBe(false);
    // ajustes sigue encendido (core)
    expect(all.ajustes).toBe(true);
  });

  it("true explícito mantiene el módulo encendido", () => {
    const f = normalizeFeatures({ agenda: true, caja: true });
    expect(f.agenda).toBe(true);
    expect(f.caja).toBe(true);
  });
});

describe("add-on whatsapp (optIn)", () => {
  it("está apagado por defecto cuando la clave falta (optIn)", () => {
    const f = normalizeFeatures({});
    expect(f.whatsapp).toBe(false);
  });

  it("está apagado por defecto con null/undefined (optIn)", () => {
    expect(normalizeFeatures(null).whatsapp).toBe(false);
    expect(normalizeFeatures(undefined).whatsapp).toBe(false);
  });

  it("se enciende solo cuando está explícitamente en true", () => {
    const f = normalizeFeatures({ whatsapp: true });
    expect(f.whatsapp).toBe(true);
  });

  it("false explícito sigue siendo false", () => {
    const f = normalizeFeatures({ whatsapp: false });
    expect(f.whatsapp).toBe(false);
  });

  it("los demás módulos opt-out siguen encendidos aunque whatsapp esté apagado", () => {
    const f = normalizeFeatures({ whatsapp: false });
    expect(f.agenda).toBe(true);
    expect(f.pacientes).toBe(true);
    expect(f.caja).toBe(true);
  });

  it("isEnabled refleja el estado del add-on", () => {
    expect(isEnabled(normalizeFeatures({ whatsapp: true }), "whatsapp")).toBe(true);
    expect(isEnabled(normalizeFeatures({ whatsapp: false }), "whatsapp")).toBe(false);
    expect(isEnabled(normalizeFeatures({}), "whatsapp")).toBe(false);
  });

  it("whatsapp es optIn en el catálogo FEATURES", () => {
    const meta = FEATURES.find((f) => f.key === "whatsapp");
    expect(meta).toBeDefined();
    expect(meta?.optIn).toBe(true);
    expect(meta?.core).toBeFalsy();
  });

  it("activar whatsapp no afecta a otros módulos", () => {
    const antes = normalizeFeatures({ caja: false });
    const despues = normalizeFeatures({ caja: false, whatsapp: true });
    expect(despues.whatsapp).toBe(true);
    expect(despues.caja).toBe(antes.caja); // sigue igual: false
    expect(despues.agenda).toBe(antes.agenda); // sigue igual: true
  });
});
