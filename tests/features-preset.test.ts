import { describe, it, expect } from "vitest";
import { initialFeaturesForPreset, MODULE_KEYS, FEATURES, ADDON_GROUPS, normalizeFeatures } from "@/lib/features";

describe("initialFeaturesForPreset", () => {
  it("consultorio apaga inventario/caja/cuentas/auditoria y deja lo esencial", () => {
    const f = initialFeaturesForPreset("consultorio", { whatsapp: false });
    expect(f.agenda).toBe(true);
    expect(f.pacientes).toBe(true);
    expect(f.mis_trabajos).toBe(true);
    expect(f.tratamientos).toBe(true);
    expect(f.inventario).toBe(false);
    expect(f.caja).toBe(false);
    expect(f.cuentas).toBe(false);
    expect(f.auditoria).toBe(false);
  });

  it("clinica enciende todos los modulos", () => {
    const f = initialFeaturesForPreset("clinica", { whatsapp: false });
    for (const k of MODULE_KEYS) expect(f[k]).toBe(true);
  });

  it("propaga el flag de whatsapp", () => {
    expect(initialFeaturesForPreset("consultorio", { whatsapp: true }).whatsapp).toBe(true);
    expect(initialFeaturesForPreset("clinica", { whatsapp: false }).whatsapp).toBe(false);
  });

  it("define explícitamente cada MODULE_KEY (no depende de defaults por ausencia)", () => {
    const f = initialFeaturesForPreset("consultorio", { whatsapp: false });
    for (const k of MODULE_KEYS) expect(k in f).toBe(true);
  });
});

describe("preguntas_registro feature", () => {
  it("preguntas_registro es opt-in, apagado por defecto, y está en un grupo de ADDON_GROUPS", () => {
    const meta = FEATURES.find((f) => f.key === "preguntas_registro");
    expect(meta?.optIn).toBe(true);
    expect(normalizeFeatures({}).preguntas_registro).toBe(false);
    const inSomeGroup = ADDON_GROUPS.some((g) => g.keys.includes("preguntas_registro"));
    expect(inSomeGroup).toBe(true);
  });
});
