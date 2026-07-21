import { describe, it, expect } from "vitest";
import { buildEventTitle, buildEventDescription } from "@/lib/google-calendar/eventContent";

describe("buildEventTitle", () => {
  it("nombre + motivo cuando hay motivo", () => {
    expect(buildEventTitle("Juan Pérez", "Control", false)).toBe("Juan Pérez — Control");
  });

  it("solo nombre cuando no hay motivo", () => {
    expect(buildEventTitle("Juan Pérez", null, false)).toBe("Juan Pérez");
    expect(buildEventTitle("Juan Pérez", "", false)).toBe("Juan Pérez");
    expect(buildEventTitle("Juan Pérez", undefined, false)).toBe("Juan Pérez");
  });

  it("antepone [Cancelado] cuando cancelled=true", () => {
    expect(buildEventTitle("Juan Pérez", "Control", true)).toBe("[Cancelado] Juan Pérez — Control");
    expect(buildEventTitle("Juan Pérez", null, true)).toBe("[Cancelado] Juan Pérez");
  });
});

describe("buildEventDescription", () => {
  it("incluye el teléfono si existe", () => {
    expect(buildEventDescription("70012345")).toBe("Tel: 70012345");
  });

  it("cadena vacía si no hay teléfono", () => {
    expect(buildEventDescription(null)).toBe("");
    expect(buildEventDescription(undefined)).toBe("");
    expect(buildEventDescription("")).toBe("");
  });
});
