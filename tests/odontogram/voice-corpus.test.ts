import { describe, expect, it } from "vitest";
import { validateVoiceOperations, applyVoiceOperations, voiceOperationsSchema } from "@/lib/odontogram/voice";
import corpus from "@/tests/fixtures/odontogram-voice-es.json";

interface CorpusEntry {
  id: number;
  transcript: string;
  expected: { operations: unknown[]; uncertainties: string[] };
}

const entries = corpus as CorpusEntry[];

describe("corpus de dictados odontológicos en español", () => {
  it("tiene al menos 100 dictados versionados", () => {
    expect(entries.length).toBeGreaterThanOrEqual(100);
  });

  it("cada entrada tiene transcript y una salida esperada (operaciones o incertidumbre)", () => {
    for (const entry of entries) {
      expect(entry.transcript.length).toBeGreaterThan(0);
      const hasOperations = entry.expected.operations.length > 0;
      const hasUncertainty = entry.expected.uncertainties.length > 0;
      expect(hasOperations || hasUncertainty).toBe(true);
    }
  });

  it("las operaciones esperadas siempre cumplen el esquema cerrado y son válidas para dentición permanente", () => {
    for (const entry of entries) {
      if (entry.expected.operations.length === 0) continue;
      expect(voiceOperationsSchema.safeParse(entry.expected.operations).success).toBe(true);
      const results = validateVoiceOperations(entry.expected.operations, "permanent");
      expect(results.every((r) => r.valid)).toBe(true);
    }
  });

  it("las entradas ambiguas no proponen ninguna operación especulativa", () => {
    const ambiguous = entries.filter((e) => e.expected.uncertainties.length > 0);
    expect(ambiguous.length).toBeGreaterThan(0);
    for (const entry of ambiguous) expect(entry.expected.operations).toEqual([]);
  });

  it("aplicar las operaciones esperadas de todo el corpus no lanza y produce un TeethMap válido", () => {
    let teeth = {};
    for (const entry of entries) {
      teeth = applyVoiceOperations(teeth, entry.expected.operations as Parameters<typeof applyVoiceOperations>[1]);
    }
    expect(Object.keys(teeth).length).toBeGreaterThan(0);
  });
});
