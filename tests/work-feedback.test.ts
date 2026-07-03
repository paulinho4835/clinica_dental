import { describe, it, expect } from "vitest";
import {
  WorkFeedbackSchema,
  COMFORT_KEYS,
  COMFORT_LABEL,
  COMFORT_EMOJI,
} from "@/lib/schemas/work-feedback";

describe("WorkFeedbackSchema", () => {
  it("acepta una calificación mínima válida (solo rating)", () => {
    const r = WorkFeedbackSchema.parse({ rating: 5 });
    expect(r.rating).toBe(5);
    expect(r.comment).toBe(""); // default
    expect(r.comfort).toBeUndefined();
  });

  it("convierte rating en string a número (coerce)", () => {
    expect(WorkFeedbackSchema.parse({ rating: "4" }).rating).toBe(4);
  });

  it("rechaza rating fuera de 1–5", () => {
    expect(WorkFeedbackSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(WorkFeedbackSchema.safeParse({ rating: 6 }).success).toBe(false);
  });

  it("rechaza rating no entero", () => {
    expect(WorkFeedbackSchema.safeParse({ rating: 3.5 }).success).toBe(false);
  });

  it("rechaza falta de rating", () => {
    expect(WorkFeedbackSchema.safeParse({}).success).toBe(false);
  });

  it("acepta un comfort válido y rechaza uno inválido", () => {
    expect(WorkFeedbackSchema.parse({ rating: 3, comfort: "comodo" }).comfort).toBe("comodo");
    expect(WorkFeedbackSchema.safeParse({ rating: 3, comfort: "feliz" }).success).toBe(false);
  });

  it("recorta el comentario y rechaza si excede 1000 caracteres", () => {
    expect(WorkFeedbackSchema.parse({ rating: 3, comment: "  hola  " }).comment).toBe("hola");
    expect(WorkFeedbackSchema.safeParse({ rating: 3, comment: "x".repeat(1001) }).success).toBe(
      false,
    );
  });
});

describe("catálogo de comfort", () => {
  it("hay 5 niveles y cada uno tiene label y emoji", () => {
    expect(COMFORT_KEYS).toHaveLength(5);
    for (const key of COMFORT_KEYS) {
      expect(COMFORT_LABEL[key]).toBeTruthy();
      expect(COMFORT_EMOJI[key]).toBeTruthy();
    }
  });
});
