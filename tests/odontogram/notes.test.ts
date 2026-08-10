import { describe, expect, it } from "vitest";
import { diffToothNotes, validateToothNotes } from "@/lib/odontogram/notes";
import type { TeethMap } from "@/lib/odontogram/types";

describe("notas personalizadas del odontograma", () => {
  it("acepta una nota en una cara sin alterar la condición existente", () => {
    const teeth: TeethMap = {
      "16": {
        present: true,
        whole: null,
        surfaces: { O: "caries" },
        notes: [{ id: "note-1", surface: "O", text: "Controlar en seis meses" }],
      },
    };

    expect(validateToothNotes(teeth)).toBeNull();
    expect(teeth["16"].surfaces.O).toBe("caries");
  });

  it("rechaza texto vacío, una cara inválida y exceso de longitud", () => {
    const invalid: TeethMap = {
      "16": {
        present: true,
        whole: null,
        surfaces: {},
        notes: [{ id: "note-1", surface: "X" as never, text: " " }],
      },
    };
    expect(validateToothNotes(invalid)).not.toBeNull();

    invalid["16"].notes = [{ id: "note-1", text: "x".repeat(501) }];
    expect(validateToothNotes(invalid)).not.toBeNull();
  });

  it("registra altas, ediciones y eliminaciones en auditoría", () => {
    const before: TeethMap = {
      "16": { present: true, whole: null, surfaces: {}, notes: [{ id: "note-1", text: "Inicial" }] },
    };
    const after: TeethMap = {
      "16": { present: true, whole: null, surfaces: {}, notes: [{ id: "note-1", text: "Editada", surface: "O" }, { id: "note-2", text: "Nueva" }] },
    };

    expect(diffToothNotes(before, after)).toEqual([
      { tooth_fdi: "16", surface: "O", prev_state: "Nota: Inicial", new_state: "Nota: Editada" },
      { tooth_fdi: "16", surface: null, prev_state: null, new_state: "Nota: Nueva" },
    ]);
  });
});
