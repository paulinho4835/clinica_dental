import { describe, expect, it } from "vitest";
import {
  matchesPatientSearch,
  patientPhoneDigits,
  patientSearchTerms,
  applyPatientSearch,
} from "@/lib/patientSearchTerms";

describe("patientSearchTerms", () => {
  it("normaliza a palabras sin acentos ni mayúsculas", () => {
    expect(patientSearchTerms("  María  GÓMEZ ")).toEqual(["maria", "gomez"]);
  });

  it("ignora comas y puntos (\"Pérez, José\", CI con puntos)", () => {
    expect(patientSearchTerms("Pérez, José")).toEqual(["perez", "jose"]);
    expect(patientSearchTerms("4.835.946")).toEqual(["4835946"]);
  });

  it("quita los comodines de LIKE/PostgREST para que no alteren el patrón", () => {
    expect(patientSearchTerms("100%_ ana*")).toEqual(["100", "ana"]);
    expect(patientSearchTerms("a\\b")).toEqual(["a", "b"]);
  });

  it("conserva apóstrofes de apellidos (D'Angelo)", () => {
    expect(patientSearchTerms("D'Angelo")).toEqual(["d'angelo"]);
  });

  it("vacío o solo símbolos no produce términos", () => {
    expect(patientSearchTerms("")).toEqual([]);
    expect(patientSearchTerms(" %, ")).toEqual([]);
  });
});

describe("patientPhoneDigits", () => {
  it("reconoce búsquedas que son un teléfono", () => {
    expect(patientPhoneDigits("+591 7712-3456")).toBe("59177123456");
    expect(patientPhoneDigits("7712")).toBe("7712");
  });

  it("no trata nombres ni números muy cortos como teléfono", () => {
    expect(patientPhoneDigits("ana 77")).toBeNull();
    expect(patientPhoneDigits("12")).toBeNull();
  });
});

describe("matchesPatientSearch", () => {
  it("encuentra por palabras en cualquier orden y sin acentos", () => {
    expect(matchesPatientSearch("José Luis Pérez 4835946", "perez jose")).toBe(true);
    expect(matchesPatientSearch("María Elena Gómez", "MARIA gomez")).toBe(true);
  });

  it("exige que estén todas las palabras", () => {
    expect(matchesPatientSearch("Ana Vargas", "ana rojas")).toBe(false);
  });

  it("una búsqueda vacía coincide con todo", () => {
    expect(matchesPatientSearch("Ana Vargas", "  ")).toBe(true);
  });
});

describe("applyPatientSearch", () => {
  function fakeQuery() {
    const calls: string[] = [];
    const q = {
      ilike(column: string, pattern: string) {
        calls.push(`ilike ${column} ${pattern}`);
        return q;
      },
      or(filters: string) {
        calls.push(`or ${filters}`);
        return q;
      },
    };
    return { q, calls };
  }

  it("filtra cada palabra sobre search_text", () => {
    const { q, calls } = fakeQuery();
    applyPatientSearch(q, "Pérez, José");
    expect(calls).toEqual(["ilike search_text %perez%", "ilike search_text %jose%"]);
  });

  it("con teléfono habilitado, una búsqueda numérica mira CI y teléfono", () => {
    const { q, calls } = fakeQuery();
    applyPatientSearch(q, "7712-3456", { phone: true });
    expect(calls).toEqual(["or search_text.ilike.%77123456%,phone.ilike.%77123456%"]);
  });

  it("sin teléfono habilitado, los números se buscan solo en nombre y CI", () => {
    const { q, calls } = fakeQuery();
    applyPatientSearch(q, "7712");
    expect(calls).toEqual(["ilike search_text %7712%"]);
  });

  it("un texto con solo comodines no agrega filtros", () => {
    const { q, calls } = fakeQuery();
    applyPatientSearch(q, " % ");
    expect(calls).toEqual([]);
  });
});
