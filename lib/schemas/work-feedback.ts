import { z } from "zod";

// Escala "¿cómo se sintió?" durante la atención (caritas).
export const COMFORT_OPTIONS = [
  { key: "muy_incomodo", emoji: "😣", label: "Muy incómodo" },
  { key: "incomodo", emoji: "😕", label: "Incómodo" },
  { key: "neutral", emoji: "😐", label: "Neutral" },
  { key: "comodo", emoji: "🙂", label: "Cómodo" },
  { key: "muy_comodo", emoji: "😄", label: "Muy cómodo" },
] as const;

export const COMFORT_KEYS = [
  "muy_incomodo",
  "incomodo",
  "neutral",
  "comodo",
  "muy_comodo",
] as const;

export type ComfortKey = (typeof COMFORT_KEYS)[number];

export const COMFORT_LABEL: Record<ComfortKey, string> = Object.fromEntries(
  COMFORT_OPTIONS.map((o) => [o.key, o.label]),
) as Record<ComfortKey, string>;

export const COMFORT_EMOJI: Record<ComfortKey, string> = Object.fromEntries(
  COMFORT_OPTIONS.map((o) => [o.key, o.emoji]),
) as Record<ComfortKey, string>;

// Lo que envía el paciente. Las estrellas son obligatorias; el resto opcional.
export const WorkFeedbackSchema = z.object({
  rating: z.coerce
    .number()
    .int()
    .min(1, "Seleccione cuántas estrellas le da.")
    .max(5),
  comfort: z.enum(COMFORT_KEYS).optional(),
  comment: z.string().trim().max(1000).default(""),
});

export type WorkFeedback = z.infer<typeof WorkFeedbackSchema>;
