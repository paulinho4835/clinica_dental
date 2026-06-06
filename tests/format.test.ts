import { describe, it, expect } from "vitest";
import { bs, getInitials, normalizeSearch, boliviaTodayISO } from "@/lib/format";

describe("bs (formato Boliviano)", () => {
  it("formatea con dos decimales", () => {
    expect(bs(10)).toBe("Bs 10.00");
    expect(bs(1234.5)).toBe("Bs 1234.50");
  });

  it("trata null/undefined como 0", () => {
    expect(bs(null)).toBe("Bs 0.00");
    expect(bs(undefined)).toBe("Bs 0.00");
  });

  it("redondea a 2 decimales", () => {
    expect(bs(1.005)).toBe("Bs 1.00"); // toFixed redondeo binario conocido
    expect(bs(2.345)).toBe("Bs 2.35");
  });
});

describe("getInitials", () => {
  it("toma las dos primeras palabras en mayúscula", () => {
    expect(getInitials("María Pérez")).toBe("MP");
    expect(getInitials("juan carlos gomez")).toBe("JC");
  });

  it("funciona con un solo nombre", () => {
    expect(getInitials("Ana")).toBe("A");
  });

  it("ignora espacios extra sin romper", () => {
    expect(getInitials("  Luis   Soto ")).toBe("LS");
  });
});

describe("normalizeSearch", () => {
  it("quita acentos y pasa a minúsculas", () => {
    expect(normalizeSearch("María")).toBe("maria");
    expect(normalizeSearch("JOSÉ Núñez")).toBe("jose nunez");
  });

  it("recorta espacios alrededor", () => {
    expect(normalizeSearch("  Pérez  ")).toBe("perez");
  });

  it("'maria' encuentra a 'María' (mismo término normalizado)", () => {
    expect(normalizeSearch("maria")).toBe(normalizeSearch("María"));
  });
});

describe("boliviaTodayISO", () => {
  it("devuelve formato YYYY-MM-DD", () => {
    expect(boliviaTodayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("coincide con la fecha calendario en zona Bolivia", () => {
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/La_Paz",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(boliviaTodayISO()).toBe(expected);
  });
});
