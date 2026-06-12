import { describe, it, expect } from "vitest";
import { normalizePhone } from "@/lib/phone-utils";

// normalizePhone convierte teléfonos al formato E.164 (+591XXXXXXXX) que requiere Zavu.
// A diferencia de normalizeVapiPhone (que devuelve "591..." sin +),
// esta versión SIEMPRE agrega el "+" para cumplir E.164.

describe("normalizePhone (Zavu / E.164)", () => {
  it("número boliviano de 8 dígitos con 7 → +591XXXXXXXX", () => {
    expect(normalizePhone("71234567")).toBe("+59171234567");
  });

  it("número boliviano de 8 dígitos con 6 → +591XXXXXXXX", () => {
    expect(normalizePhone("67891234")).toBe("+59167891234");
  });

  it("número con código país 591 sin + → agrega +", () => {
    expect(normalizePhone("59171234567")).toBe("+59171234567");
  });

  it("número con código país 591 y + → lo devuelve igual", () => {
    expect(normalizePhone("+59171234567")).toBe("+59171234567");
  });

  it("número con ceros iniciales → los elimina antes de agregar código", () => {
    expect(normalizePhone("0059171234567")).toBe("+59171234567");
  });

  it("número con espacios → los elimina", () => {
    expect(normalizePhone("591 71234567")).toBe("+59171234567");
  });

  it("número con guiones → los elimina", () => {
    expect(normalizePhone("591-7123-4567")).toBe("+59171234567");
  });

  it("número de 9+ dígitos sin código Bolivia → agrega + (número extranjero corto)", () => {
    // 10 dígitos → considera que ya lleva código de país
    const result = normalizePhone("1234567890");
    expect(result).toBe("+1234567890");
  });

  it("devuelve null para null", () => {
    expect(normalizePhone(null)).toBeNull();
  });

  it("devuelve null para undefined", () => {
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("devuelve null para string vacío", () => {
    expect(normalizePhone("")).toBeNull();
  });

  it("devuelve null para string sin dígitos", () => {
    expect(normalizePhone("abc")).toBeNull();
  });

  it("devuelve null para número de 8 dígitos que NO empieza con 6 o 7", () => {
    // No es un número móvil boliviano válido
    expect(normalizePhone("51234567")).toBeNull();
  });
});
