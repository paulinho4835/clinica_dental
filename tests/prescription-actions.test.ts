import { describe, it, expect } from "vitest";
import {
  validateMedications,
  type Medication,
} from "@/app/(dashboard)/pacientes/prescription-actions";

describe("validateMedications", () => {
  it("error si la lista está vacía", () => {
    expect(validateMedications([])).toBe("Agrega al menos un medicamento.");
  });

  it("ok con medicamento nombre + dosis completos", () => {
    const meds: Medication[] = [
      { name: "Amoxicilina", dosage: "500mg", instructions: "1 cada 8h" },
    ];
    expect(validateMedications(meds)).toBeNull();
  });

  it("error si nombre está vacío (solo espacios)", () => {
    const meds: Medication[] = [{ name: "  ", dosage: "500mg", instructions: "" }];
    expect(validateMedications(meds)).toBe("El nombre del medicamento es requerido.");
  });

  it("error si dosis está vacía", () => {
    const meds: Medication[] = [{ name: "Ibuprofeno", dosage: "  ", instructions: "" }];
    expect(validateMedications(meds)).toBe("La dosis del medicamento es requerida.");
  });

  it("instructions es opcional — string vacío permitido", () => {
    const meds: Medication[] = [{ name: "Paracetamol", dosage: "1g", instructions: "" }];
    expect(validateMedications(meds)).toBeNull();
  });

  it("valida TODOS los items — detecta el segundo si el primero es válido", () => {
    const meds: Medication[] = [
      { name: "Amoxicilina", dosage: "500mg", instructions: "" },
      { name: "", dosage: "10mg", instructions: "" },
    ];
    expect(validateMedications(meds)).toBe("El nombre del medicamento es requerido.");
  });
});
