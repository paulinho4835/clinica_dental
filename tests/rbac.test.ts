import { describe, it, expect } from "vitest";
import { can } from "@/lib/rbac";

describe("can (permisos por rol)", () => {
  it("admin puede todo lo evaluado", () => {
    expect(can("admin", "settings:write")).toBe(true);
    expect(can("admin", "billing:write")).toBe(true);
    expect(can("admin", "patients:delete")).toBe(true);
  });

  it("recepcionista cobra y gestiona pacientes, pero no toca clínica/ajustes", () => {
    expect(can("recepcionista", "billing:write")).toBe(true);
    expect(can("recepcionista", "patients:write")).toBe(true);
    expect(can("recepcionista", "clinical:write")).toBe(false);
    expect(can("recepcionista", "settings:write")).toBe(false);
  });

  it("odontólogo edita lo clínico pero no factura", () => {
    expect(can("odontologo_general", "clinical:write")).toBe(true);
    expect(can("odontologo_general", "billing:write")).toBe(false);
  });

  it("asistente solo lee pacientes y mueve inventario", () => {
    expect(can("asistente", "patients:read")).toBe(true);
    expect(can("asistente", "inventory:write")).toBe(true);
    expect(can("asistente", "patients:write")).toBe(false);
  });

  it("rol indefinido nunca tiene permisos", () => {
    expect(can(undefined, "patients:read")).toBe(false);
  });
});
