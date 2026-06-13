import { describe, it, expect } from "vitest";
import { fillPlaceholders } from "../consent-utils";

describe("fillPlaceholders", () => {
  const vars = {
    nombre_paciente: "Juan Pérez",
    fecha: "13/06/2026",
    doctor: "Dra. Ana Gómez",
    clinica: "Clínica Dental Norte",
  };

  it("reemplaza todos los placeholders conocidos", () => {
    const body =
      "Yo, {{nombre_paciente}}, autorizo a {{doctor}} de {{clinica}}. Fecha: {{fecha}}.";
    expect(fillPlaceholders(body, vars)).toBe(
      "Yo, Juan Pérez, autorizo a Dra. Ana Gómez de Clínica Dental Norte. Fecha: 13/06/2026."
    );
  });

  it("reemplaza múltiples ocurrencias del mismo placeholder", () => {
    const body = "{{nombre_paciente}} — firmado por {{nombre_paciente}}";
    expect(fillPlaceholders(body, vars)).toBe(
      "Juan Pérez — firmado por Juan Pérez"
    );
  });

  it("deja intactos los placeholders no definidos", () => {
    const body = "Hola {{nombre_paciente}} — {{desconocido}}";
    expect(fillPlaceholders(body, vars)).toBe(
      "Hola Juan Pérez — {{desconocido}}"
    );
  });

  it("devuelve el texto sin cambios si no hay placeholders", () => {
    const body = "Texto sin variables.";
    expect(fillPlaceholders(body, vars)).toBe("Texto sin variables.");
  });

  it("maneja body vacío", () => {
    expect(fillPlaceholders("", vars)).toBe("");
  });
});
