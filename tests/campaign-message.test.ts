import { describe, it, expect } from "vitest";
import {
  firstName,
  applyNamePlaceholder,
  buildCampaignWaLink,
} from "@/lib/campaign-message";

describe("firstName", () => {
  it("devuelve la primera palabra del nombre completo", () => {
    expect(firstName("Juan Pérez López")).toBe("Juan");
  });

  it("recorta espacios extra", () => {
    expect(firstName("  María   Fernanda Gómez")).toBe("María");
  });

  it("nombre de una sola palabra se devuelve tal cual", () => {
    expect(firstName("Pedro")).toBe("Pedro");
  });

  it("cadena vacía devuelve cadena vacía", () => {
    expect(firstName("")).toBe("");
  });
});

describe("applyNamePlaceholder", () => {
  it("reemplaza {nombre} por el primer nombre del paciente", () => {
    expect(applyNamePlaceholder("Hola {nombre}, tenemos una promo", "Juan Pérez")).toBe(
      "Hola Juan, tenemos una promo",
    );
  });

  it("reemplaza TODAS las ocurrencias de {nombre}", () => {
    expect(applyNamePlaceholder("{nombre}, hola {nombre}!", "Ana López")).toBe(
      "Ana, hola Ana!",
    );
  });

  it("mensaje sin placeholder se devuelve sin cambios", () => {
    expect(applyNamePlaceholder("Promo para todos", "Juan Pérez")).toBe(
      "Promo para todos",
    );
  });
});

describe("buildCampaignWaLink", () => {
  it("arma el link wa.me con el teléfono normalizado y el mensaje codificado", () => {
    const link = buildCampaignWaLink("71234567", "Hola {nombre}!", "Juan Pérez");
    expect(link).toBe(
      "https://wa.me/59171234567?text=" + encodeURIComponent("Hola Juan!"),
    );
  });

  it("teléfono inválido devuelve null", () => {
    expect(buildCampaignWaLink("abc", "Hola {nombre}", "Juan Pérez")).toBeNull();
  });

  it("teléfono null devuelve null", () => {
    expect(buildCampaignWaLink(null, "Hola {nombre}", "Juan Pérez")).toBeNull();
  });
});
