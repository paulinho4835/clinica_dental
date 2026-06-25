import { describe, it, expect } from "vitest";
import {
  AnamnesisSchema,
  EMPTY_ANAMNESIS,
  parseAnamnesis,
  ANTECEDENTES_FIELDS,
} from "@/lib/schemas/anamnesis";

describe("anamnesis schema", () => {
  it("EMPTY_ANAMNESIS es válido contra el schema", () => {
    expect(AnamnesisSchema.safeParse(EMPTY_ANAMNESIS).success).toBe(true);
  });

  it("parseAnamnesis(null) devuelve el objeto vacío completo", () => {
    expect(parseAnamnesis(null)).toEqual(EMPTY_ANAMNESIS);
  });

  it("parseAnamnesis hace merge de un objeto parcial sin perder defaults", () => {
    const r = parseAnamnesis({ medicacion_habitual: "Aspirina" });
    expect(r.medicacion_habitual).toBe("Aspirina");
    expect(r.antecedentes.diabetes).toBe(false);
    expect(r.embarazo).toBe("no_aplica");
  });

  it("parseAnamnesis ignora claves desconocidas y conserva la forma", () => {
    const r = parseAnamnesis({ basura: 123, habitos: { tabaco: true } });
    expect(r.habitos.tabaco).toBe(true);
    expect("basura" in r).toBe(false);
  });

  it("ANTECEDENTES_FIELDS y el schema de antecedentes están sincronizados", () => {
    for (const f of ANTECEDENTES_FIELDS) {
      expect(EMPTY_ANAMNESIS.antecedentes).toHaveProperty(f.key);
    }
  });
});
