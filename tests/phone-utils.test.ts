import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/phone-utils";

describe("normalizePhone", () => {
  it("devuelve null para vacío/nulo/indefinido", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });

  it("devuelve null si no hay dígitos", () => {
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone("--- ()")).toBeNull();
  });

  it("celular boliviano de 8 dígitos (empieza en 6 o 7) → +591XXXXXXXX", () => {
    expect(normalizePhone("71234567")).toBe("+59171234567");
    expect(normalizePhone("60000000")).toBe("+59160000000");
  });

  it("limpia separadores (espacios, guiones, puntos, paréntesis)", () => {
    expect(normalizePhone("7 12-34.567")).toBe("+59171234567");
    expect(normalizePhone("(712) 345 67")).toBe("+59171234567");
  });

  it("número que ya trae prefijo 591 → antepone +", () => {
    expect(normalizePhone("59171234567")).toBe("+59171234567");
    expect(normalizePhone("+591 71234567")).toBe("+59171234567");
  });

  it("quita ceros a la izquierda antes de evaluar", () => {
    expect(normalizePhone("071234567")).toBe("+59171234567");
  });

  it("8 dígitos que NO empiezan en 6/7 no se asumen bolivianos", () => {
    // 8 dígitos arrancando en 8 → no entra en la regla de celular BO ni en >=9.
    expect(normalizePhone("84000000")).toBeNull();
  });

  it("números internacionales de 9+ dígitos → +<dígitos>", () => {
    expect(normalizePhone("12025550100")).toBe("+12025550100");
    expect(normalizePhone("549111234567")).toBe("+549111234567");
  });

  it("muy corto (<8 dígitos, no 591) → null", () => {
    expect(normalizePhone("1234")).toBeNull();
    expect(normalizePhone("7123456")).toBeNull(); // 7 dígitos
  });
});
