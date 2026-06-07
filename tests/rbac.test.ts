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

describe("especialista (igual que odontólogo pero verificado)", () => {
  it("puede leer pacientes y escribir lo clínico", () => {
    expect(can("especialista", "patients:read")).toBe(true);
    expect(can("especialista", "appointments:write")).toBe(true);
    expect(can("especialista", "clinical:write")).toBe(true);
  });

  it("NO puede facturar ni administrar", () => {
    expect(can("especialista", "billing:write")).toBe(false);
    expect(can("especialista", "settings:write")).toBe(false);
    expect(can("especialista", "expenses:write")).toBe(false);
    expect(can("especialista", "inventory:write")).toBe(false);
  });
});

describe("permisos límite por rol", () => {
  it("recepcionista NO puede registrar gastos", () => {
    expect(can("recepcionista", "expenses:write")).toBe(false);
  });

  it("recepcionista SÍ puede gestionar citas", () => {
    expect(can("recepcionista", "appointments:write")).toBe(true);
  });

  it("odontologo_general SÍ puede leer pacientes y gestionar citas", () => {
    expect(can("odontologo_general", "patients:read")).toBe(true);
    expect(can("odontologo_general", "appointments:write")).toBe(true);
  });

  it("odontologo_general NO puede eliminar pacientes", () => {
    expect(can("odontologo_general", "patients:delete")).toBe(false);
  });

  it("asistente NO puede gestionar citas ni hacer clínica", () => {
    expect(can("asistente", "appointments:write")).toBe(false);
    expect(can("asistente", "clinical:write")).toBe(false);
    expect(can("asistente", "billing:write")).toBe(false);
  });

  it("admin puede gestionar gastos e inventario", () => {
    expect(can("admin", "expenses:write")).toBe(true);
    expect(can("admin", "inventory:write")).toBe(true);
    expect(can("admin", "appointments:write")).toBe(true);
  });
});
