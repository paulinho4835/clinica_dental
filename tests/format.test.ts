import { describe, it, expect } from "vitest";
import { money, getInitials, normalizeSearch, boliviaTodayISO } from "@/lib/format";

describe("money (formato de moneda configurable)", () => {
  it("formatea con dos decimales usando el símbolo dado", () => {
    expect(money(10, "Bs")).toBe("Bs 10.00");
    expect(money(1234.5, "Bs")).toBe("Bs 1234.50");
  });

  it("trata null/undefined como 0", () => {
    expect(money(null, "Bs")).toBe("Bs 0.00");
    expect(money(undefined, "Bs")).toBe("Bs 0.00");
  });

  it("redondea a 2 decimales", () => {
    expect(money(1.005, "Bs")).toBe("Bs 1.00"); // toFixed redondeo binario conocido
    expect(money(2.345, "Bs")).toBe("Bs 2.35");
  });

  it("usa el símbolo de moneda de la clínica, no un valor fijo", () => {
    expect(money(10, "S/")).toBe("S/ 10.00");
    expect(money(10, "€")).toBe("€ 10.00");
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

describe("money – casos límite", () => {
  it("cero explícito", () => {
    expect(money(0, "Bs")).toBe("Bs 0.00");
  });

  it("número negativo (devolución / nota de crédito)", () => {
    expect(money(-50, "Bs")).toBe("Bs -50.00");
  });

  it("número grande", () => {
    expect(money(10000, "Bs")).toBe("Bs 10000.00");
  });
});

describe("getInitials – casos límite", () => {
  it("string vacío devuelve string vacío (sin crash)", () => {
    expect(getInitials("")).toBe("");
  });

  it("más de dos palabras: solo toma las dos primeras", () => {
    expect(getInitials("María del Carmen Quispe")).toBe("MD");
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
