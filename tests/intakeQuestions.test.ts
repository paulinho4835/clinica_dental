import { describe, expect, it } from "vitest";
import {
  getIntakeQuestions,
  getActiveIntakeQuestions,
  slugifyQuestionKey,
  validateIntakeQuestionsConfig,
  validateCustomAnswers,
  MAX_INTAKE_QUESTIONS,
  type IntakeQuestion,
} from "@/lib/intakeQuestions";

const base = (over: Partial<IntakeQuestion> = {}): IntakeQuestion => ({
  key: "seguro_medico",
  label: "¿Tienes seguro médico?",
  type: "boolean",
  required: false,
  active: true,
  position: 0,
  ...over,
});

describe("getIntakeQuestions / getActiveIntakeQuestions", () => {
  it("lee el array desde settings.custom_intake_questions, ignora basura", () => {
    expect(getIntakeQuestions(null)).toEqual([]);
    expect(getIntakeQuestions({})).toEqual([]);
    expect(getIntakeQuestions({ custom_intake_questions: "no-es-array" })).toEqual([]);
    const settings = { custom_intake_questions: [base()] };
    expect(getIntakeQuestions(settings)).toEqual([base()]);
  });

  it("getActiveIntakeQuestions filtra inactivas y ordena por position", () => {
    const settings = {
      custom_intake_questions: [
        base({ key: "b", position: 1, active: true }),
        base({ key: "a", position: 0, active: true }),
        base({ key: "c", position: 2, active: false }),
      ],
    };
    expect(getActiveIntakeQuestions(settings).map((q) => q.key)).toEqual(["a", "b"]);
  });
});

describe("slugifyQuestionKey", () => {
  it("genera un slug legible sin acentos ni mayúsculas", () => {
    expect(slugifyQuestionKey("¿Tienes Seguro Médico?", [])).toBe("tienes_seguro_medico");
  });

  it("agrega sufijo numérico si el slug ya existe", () => {
    expect(slugifyQuestionKey("Seguro", ["seguro"])).toBe("seguro_2");
    expect(slugifyQuestionKey("Seguro", ["seguro", "seguro_2"])).toBe("seguro_3");
  });

  it("usa un fallback si el label no deja caracteres válidos", () => {
    expect(slugifyQuestionKey("???", [])).toBe("pregunta");
  });
});

describe("validateIntakeQuestionsConfig", () => {
  it("rechaza más de MAX_INTAKE_QUESTIONS preguntas", () => {
    const many = Array.from({ length: MAX_INTAKE_QUESTIONS + 1 }, (_, i) =>
      base({ key: `q${i}`, position: i }),
    );
    const result = validateIntakeQuestionsConfig(many);
    expect(result.ok).toBe(false);
  });

  it("rechaza labels vacíos y claves duplicadas", () => {
    expect(validateIntakeQuestionsConfig([base({ label: "  " })]).ok).toBe(false);
    expect(
      validateIntakeQuestionsConfig([base({ key: "x" }), base({ key: "x" })]).ok,
    ).toBe(false);
  });

  it("exige entre 2 y 8 opciones únicas para type select", () => {
    expect(
      validateIntakeQuestionsConfig([
        base({ type: "select", options: ["solo una"] }),
      ]).ok,
    ).toBe(false);
    expect(
      validateIntakeQuestionsConfig([
        base({ type: "select", options: ["a", "a"] }),
      ]).ok,
    ).toBe(false);
    expect(
      validateIntakeQuestionsConfig([
        base({ type: "select", options: ["a", "b"] }),
      ]).ok,
    ).toBe(true);
  });
});

describe("validateCustomAnswers", () => {
  const questions: IntakeQuestion[] = [
    base({ key: "seguro", label: "¿Tienes seguro?", type: "boolean", required: true }),
    base({ key: "plan", label: "¿Qué plan tienes?", type: "select", options: ["Básico", "Premium"], required: false }),
    base({ key: "nota", label: "Nota adicional", type: "text", required: false }),
  ];

  it("acepta respuestas válidas y produce snapshots con el label vigente", () => {
    const result = validateCustomAnswers(questions, { seguro: true, plan: "Premium" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshots).toEqual([
        { key: "seguro", label: "¿Tienes seguro?", type: "boolean", value: true },
        { key: "plan", label: "¿Qué plan tienes?", type: "select", value: "Premium" },
      ]);
    }
  });

  it("rechaza si falta una pregunta required", () => {
    const result = validateCustomAnswers(questions, { plan: "Premium" });
    expect(result.ok).toBe(false);
  });

  it("rechaza una opción de select que no está en la lista permitida", () => {
    const result = validateCustomAnswers(questions, { seguro: true, plan: "Otro plan" });
    expect(result.ok).toBe(false);
  });

  it("rechaza tipo incorrecto (boolean como string)", () => {
    const result = validateCustomAnswers(questions, { seguro: "true" });
    expect(result.ok).toBe(false);
  });

  it("ignora claves que no corresponden a ninguna pregunta activa", () => {
    const result = validateCustomAnswers(questions, {
      seguro: true,
      clave_inventada: "lo que sea",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.snapshots.some((s) => s.key === "clave_inventada")).toBe(false);
    }
  });

  it("con lista de preguntas vacía, cualquier respuesta se ignora sin error", () => {
    const result = validateCustomAnswers([], { seguro: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.snapshots).toEqual([]);
  });
});
