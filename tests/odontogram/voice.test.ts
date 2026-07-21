import { describe, expect, it } from "vitest";
import {
  applyVoiceOperations,
  describeVoiceOperation,
  normalizeDentalTerms,
  validateVoiceOperations,
  voiceOperationsSchema,
  type VoiceOperation,
} from "@/lib/odontogram/voice";
import type { TeethMap } from "@/lib/odontogram/types";

describe("odontogram voice domain", () => {
  const operations: VoiceOperation[] = [
    { action: "set_surface", tooth: "46", surface: "O", condition: "caries" },
    { action: "set_surface", tooth: "46", surface: "D", condition: "caries" },
    { action: "set_whole", tooth: "11", condition: "corona" },
    { action: "set_whole", tooth: "38", condition: "extraccion_indicada" },
  ];

  it("acepta solo el contrato cerrado y hasta 20 operaciones", () => {
    expect(voiceOperationsSchema.safeParse(operations).success).toBe(true);
    expect(
      voiceOperationsSchema.safeParse([
        { action: "set_surface", tooth: "46", surface: "O", condition: "caries", extra: true },
      ]).success,
    ).toBe(false);
    expect(voiceOperationsSchema.safeParse(Array.from({ length: 21 }, () => operations[0])).success).toBe(false);
  });

  it("rechaza FDI o condiciones incompatibles con la dentición", () => {
    expect(validateVoiceOperations([{ action: "set_whole", tooth: "51", condition: "corona" }], "permanent")[0].valid).toBe(false);
    expect(validateVoiceOperations([{ action: "set_whole", tooth: "46", condition: "corona" }], "pediatric")[0].valid).toBe(false);
    expect(validateVoiceOperations([{ action: "set_surface", tooth: "46", surface: "O", condition: "corona" }])[0].valid).toBe(false);
    expect(validateVoiceOperations(operations).every((result) => result.valid)).toBe(true);
  });

  it("aplica operaciones en orden sin mutar el odontograma", () => {
    const original: TeethMap = { "46": { present: true, whole: null, surfaces: { M: "resina" } } };
    const next = applyVoiceOperations(original, [
      ...operations.slice(0, 2),
      { action: "clear_surface", tooth: "46", surface: "O" },
      { action: "set_whole", tooth: "46", condition: "corona" },
      { action: "clear_whole", tooth: "46" },
    ]);

    expect(next["46"]).toEqual({ present: true, whole: null, surfaces: { M: "resina", D: "caries" } });
    expect(original).toEqual({ "46": { present: true, whole: null, surfaces: { M: "resina" } } });
    expect(next).not.toBe(original);
    expect(next["46"]).not.toBe(original["46"]);
  });

  it("normaliza solo vocabulario explícito y describe propuestas", () => {
    expect(normalizeDentalTerms("Caries oclusal y bucal en el 46")).toBe("caries O y V en el 46");
    expect(describeVoiceOperation(operations[0])).toBe("Diente 46: Caries en cara oclusal.");
  });
});
