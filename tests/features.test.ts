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

describe("whatsapp (Baileys) — flag derivado", () => {
  // Ya no es un opt-in directo: se deriva de wa_masivo || recordatorios.
  // El valor guardado en DB para `whatsapp` se ignora a propósito.
  it("apagado cuando ni wa_masivo ni recordatorios están activos", () => {
    expect(normalizeFeatures({}).whatsapp).toBe(false);
    expect(normalizeFeatures(null).whatsapp).toBe(false);
    expect(normalizeFeatures(undefined).whatsapp).toBe(false);
  });

  it("se enciende si wa_masivo está activo", () => {
    expect(normalizeFeatures({ wa_masivo: true }).whatsapp).toBe(true);
  });

  it("se enciende si recordatorios está activo", () => {
    expect(normalizeFeatures({ recordatorios: true }).whatsapp).toBe(true);
  });

  it("se enciende si ambos están activos", () => {
    expect(normalizeFeatures({ wa_masivo: true, recordatorios: true }).whatsapp).toBe(true);
  });

  it("ignora el valor guardado de `whatsapp` (ya no hay toggle propio)", () => {
    // whatsapp:true pero sin wa_masivo/recordatorios → derivado a false.
    expect(normalizeFeatures({ whatsapp: true }).whatsapp).toBe(false);
    // whatsapp:false pero recordatorios on → derivado a true.
    expect(normalizeFeatures({ whatsapp: false, recordatorios: true }).whatsapp).toBe(true);
  });

  it("whatsapp NO está en el catálogo FEATURES (no es toggle de superadmin)", () => {
    expect(FEATURES.find((f) => f.key === "whatsapp")).toBeUndefined();
  });

  it("isEnabled refleja el estado derivado", () => {
    expect(isEnabled(normalizeFeatures({ wa_masivo: true }), "whatsapp")).toBe(true);
    expect(isEnabled(normalizeFeatures({}), "whatsapp")).toBe(false);
  });

  it("derivar whatsapp no afecta a otros módulos", () => {
    const f = normalizeFeatures({ caja: false, recordatorios: true });
    expect(f.whatsapp).toBe(true);
    expect(f.caja).toBe(false); // sigue apagado
    expect(f.agenda).toBe(true); // sigue encendido (opt-out)
  });
});
