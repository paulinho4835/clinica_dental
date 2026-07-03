import { describe, it, expect } from "vitest";
import {
  PatientIntakeSchema,
  parseIntake,
  EMPTY_INTAKE,
} from "@/lib/schemas/patient-intake";

describe("PatientIntakeSchema", () => {
  it("requiere full_name no vacío", () => {
    expect(PatientIntakeSchema.safeParse({}).success).toBe(false);
    expect(PatientIntakeSchema.safeParse({ full_name: "   " }).success).toBe(false);
  });

  it("acepta solo full_name y rellena el resto con ''", () => {
    const r = PatientIntakeSchema.parse({ full_name: "Ana" });
    expect(r).toEqual({
      full_name: "Ana",
      national_id: "",
      dob: "",
      sex: "",
      email: "",
      address: "",
      phone: "",
    });
  });

  it("recorta espacios en todos los campos", () => {
    const r = PatientIntakeSchema.parse({ full_name: "  Ana  ", phone: "  712  " });
    expect(r.full_name).toBe("Ana");
    expect(r.phone).toBe("712");
  });
});

describe("parseIntake", () => {
  it("devuelve EMPTY_INTAKE ante entradas inválidas", () => {
    expect(parseIntake(undefined)).toEqual(EMPTY_INTAKE);
    expect(parseIntake({})).toEqual(EMPTY_INTAKE);
    expect(parseIntake({ full_name: "" })).toEqual(EMPTY_INTAKE);
  });

  it("devuelve los datos parseados cuando son válidos", () => {
    const r = parseIntake({ full_name: "Beto", email: "b@x.com" });
    expect(r.full_name).toBe("Beto");
    expect(r.email).toBe("b@x.com");
  });
});
