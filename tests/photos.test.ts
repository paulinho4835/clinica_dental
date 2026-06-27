import { describe, it, expect } from "vitest";
import {
  photoQuota,
  fotosEnabled,
  FOTOS_DEFAULT_QUOTA,
  normalizeFeatures,
  FEATURES,
} from "@/lib/features";

describe("photoQuota — tope de fotos por clínica", () => {
  it("devuelve 0 si el addon de fotos está apagado", () => {
    expect(photoQuota({})).toBe(0);
    expect(photoQuota({ fotos: false })).toBe(0);
    expect(photoQuota({ fotos: false, fotos_max: 5000 })).toBe(0);
  });

  it("usa el default (2000) si el addon está encendido sin número", () => {
    expect(photoQuota({ fotos: true })).toBe(FOTOS_DEFAULT_QUOTA);
    expect(photoQuota({ fotos: true })).toBe(2000);
  });

  it("respeta el número configurado en fotos_max", () => {
    expect(photoQuota({ fotos: true, fotos_max: 5000 })).toBe(5000);
    expect(photoQuota({ fotos: true, fotos_max: 1 })).toBe(1);
  });

  it("trunca valores decimales a entero", () => {
    expect(photoQuota({ fotos: true, fotos_max: 3000.9 })).toBe(3000);
  });

  it("ignora valores inválidos y cae al default", () => {
    expect(photoQuota({ fotos: true, fotos_max: 0 })).toBe(FOTOS_DEFAULT_QUOTA);
    expect(photoQuota({ fotos: true, fotos_max: -100 })).toBe(FOTOS_DEFAULT_QUOTA);
    expect(photoQuota({ fotos: true, fotos_max: NaN })).toBe(FOTOS_DEFAULT_QUOTA);
    expect(photoQuota({ fotos: true, fotos_max: Infinity })).toBe(FOTOS_DEFAULT_QUOTA);
    expect(photoQuota({ fotos: true, fotos_max: "5000" })).toBe(FOTOS_DEFAULT_QUOTA);
  });

  it("requiere fotos === true (truthy no basta: solo el booleano explícito)", () => {
    expect(photoQuota({ fotos: 1 })).toBe(0);
    expect(photoQuota({ fotos: "true" })).toBe(0);
  });

  it("tolera entradas nulas / no-objeto", () => {
    expect(photoQuota(null)).toBe(0);
    expect(photoQuota(undefined)).toBe(0);
  });
});

describe("fotos — addons opt-in (apagados por defecto)", () => {
  it("fotos y fotos_contador están apagados en una clínica sin config", () => {
    const f = normalizeFeatures({});
    expect(f.fotos).toBe(false);
    expect(f.fotos_contador).toBe(false);
  });

  it("solo se encienden con true explícito", () => {
    const f = normalizeFeatures({ fotos: true, fotos_contador: true });
    expect(f.fotos).toBe(true);
    expect(f.fotos_contador).toBe(true);
  });

  it("fotosEnabled refleja el flag del addon", () => {
    expect(fotosEnabled(normalizeFeatures({ fotos: true }))).toBe(true);
    expect(fotosEnabled(normalizeFeatures({}))).toBe(false);
  });

  it("el contador puede estar encendido independientemente del módulo", () => {
    // En la práctica el superadmin enciende ambos, pero el normalizador los trata
    // como flags independientes.
    const f = normalizeFeatures({ fotos_contador: true });
    expect(f.fotos).toBe(false);
    expect(f.fotos_contador).toBe(true);
  });

  it("ambos están registrados como opt-in en el catálogo FEATURES", () => {
    const fotos = FEATURES.find((x) => x.key === "fotos");
    const contador = FEATURES.find((x) => x.key === "fotos_contador");
    expect(fotos?.optIn).toBe(true);
    expect(contador?.optIn).toBe(true);
  });
});
