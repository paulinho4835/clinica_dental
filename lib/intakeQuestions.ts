import { z } from "zod";

export type IntakeQuestionType = "text" | "boolean" | "select";

export interface IntakeQuestion {
  key: string;
  label: string;
  type: IntakeQuestionType;
  options?: string[];
  required: boolean;
  active: boolean;
  position: number;
}

export interface IntakeAnswerSnapshot {
  key: string;
  label: string;
  type: IntakeQuestionType;
  value: string | boolean;
}

export const MAX_INTAKE_QUESTIONS = 10;

const questionSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  type: z.enum(["text", "boolean", "select"]),
  options: z.array(z.string()).optional(),
  required: z.boolean(),
  active: z.boolean(),
  position: z.number().int(),
});

// Lee la lista completa (activas e inactivas) desde clinics.settings — usada
// por el editor de Ajustes. Config corrupta o ausente devuelve [] (nunca
// rompe la página de Ajustes ni el formulario público).
export function getIntakeQuestions(settings: unknown): IntakeQuestion[] {
  const raw = (settings as Record<string, unknown> | null)?.custom_intake_questions;
  if (!Array.isArray(raw)) return [];
  const parsed = z.array(questionSchema).safeParse(raw);
  return parsed.success ? (parsed.data as IntakeQuestion[]) : [];
}

// Solo las preguntas que se muestran en el formulario público de alta, en
// orden de despliegue.
export function getActiveIntakeQuestions(settings: unknown): IntakeQuestion[] {
  return getIntakeQuestions(settings)
    .filter((q) => q.active)
    .sort((a, b) => a.position - b.position);
}

// Slug estable a partir del label (para el `key` interno). Se genera una vez
// al crear la pregunta y no cambia aunque se edite el label después.
export function slugifyQuestionKey(label: string, existingKeys: readonly string[]): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "pregunta";
  if (!existingKeys.includes(base)) return base;
  let n = 2;
  while (existingKeys.includes(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

export type ValidationResult = { ok: true } | { ok: false; error: string };

// Valida la config completa antes de guardarla en clinics.settings (Ajustes).
export function validateIntakeQuestionsConfig(questions: IntakeQuestion[]): ValidationResult {
  if (questions.length > MAX_INTAKE_QUESTIONS)
    return { ok: false, error: `Máximo ${MAX_INTAKE_QUESTIONS} preguntas.` };

  const keys = new Set<string>();
  for (const q of questions) {
    if (!q.label.trim()) return { ok: false, error: "Cada pregunta necesita un texto." };
    if (keys.has(q.key))
      return { ok: false, error: "Hay preguntas con la misma clave interna." };
    keys.add(q.key);

    if (q.type === "select") {
      const opts = (q.options ?? []).map((o) => o.trim()).filter(Boolean);
      const unique = new Set(opts);
      if (opts.length < 2 || opts.length > 8)
        return { ok: false, error: `"${q.label}" necesita entre 2 y 8 opciones.` };
      if (unique.size !== opts.length)
        return { ok: false, error: `"${q.label}" tiene opciones repetidas.` };
    }
  }
  return { ok: true };
}

export type CustomAnswersValidation =
  | { ok: true; snapshots: IntakeAnswerSnapshot[] }
  | { ok: false; error: string };

// Valida las respuestas del paciente contra las preguntas ACTIVAS de la
// clínica y produce el snapshot que se guarda (label congelado al momento de
// responder). Cualquier clave que no corresponda a una pregunta activa se
// ignora silenciosamente (defensa en profundidad: el cliente no controla qué
// se guarda).
export function validateCustomAnswers(
  questions: IntakeQuestion[],
  raw: unknown,
): CustomAnswersValidation {
  const answers = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const snapshots: IntakeAnswerSnapshot[] = [];

  for (const q of questions) {
    const value = answers[q.key];

    if (q.type === "boolean") {
      if (value === undefined || value === null) {
        if (q.required) return { ok: false, error: `Falta responder: ${q.label}` };
        continue;
      }
      if (typeof value !== "boolean")
        return { ok: false, error: `Respuesta inválida para: ${q.label}` };
      snapshots.push({ key: q.key, label: q.label, type: q.type, value });
      continue;
    }

    const text = typeof value === "string" ? value.trim() : "";
    if (!text) {
      if (q.required) return { ok: false, error: `Falta responder: ${q.label}` };
      continue;
    }
    if (q.type === "select" && !(q.options ?? []).includes(text))
      return { ok: false, error: `Respuesta inválida para: ${q.label}` };
    snapshots.push({ key: q.key, label: q.label, type: q.type, value: text });
  }

  return { ok: true, snapshots };
}
