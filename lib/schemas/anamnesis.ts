import { z } from "zod";

// Lista ÚNICA de condiciones de antecedentes patológicos. UI y schema la usan.
export const ANTECEDENTES_FIELDS = [
  { key: "diabetes", label: "Diabetes" },
  { key: "hipertension", label: "Hipertensión" },
  { key: "cardiopatia", label: "Cardiopatía" },
  { key: "coagulacion", label: "Problemas de coagulación" },
  { key: "hepatitis", label: "Hepatitis" },
  { key: "vih", label: "VIH" },
  { key: "asma", label: "Asma" },
  { key: "epilepsia", label: "Epilepsia" },
  { key: "tiroides", label: "Problemas de tiroides" },
  { key: "artritis", label: "Artritis / reumatismo" },
  { key: "osteoporosis", label: "Osteoporosis" },
  { key: "renal", label: "Enfermedades renales" },
  { key: "anemia", label: "Anemia" },
  { key: "reaccion_anestesia", label: "Reacción a anestesia" },
  { key: "alergia_latex", label: "Alergia al látex" },
  { key: "cancer", label: "Cáncer / tumores" },
  { key: "transfusion", label: "Transfusiones de sangre" },
] as const;

export const HABITOS_FIELDS = [
  { key: "tabaco", label: "Tabaco" },
  { key: "alcohol", label: "Alcohol" },
  { key: "bruxismo", label: "Bruxismo" },
  { key: "drogas", label: "Drogas" },
] as const;

const antecedentesShape = Object.fromEntries(
  ANTECEDENTES_FIELDS.map((f) => [f.key, z.boolean().default(false)]),
) as Record<(typeof ANTECEDENTES_FIELDS)[number]["key"], z.ZodDefault<z.ZodBoolean>>;

const habitosShape = Object.fromEntries(
  HABITOS_FIELDS.map((f) => [f.key, z.boolean().default(false)]),
) as Record<(typeof HABITOS_FIELDS)[number]["key"], z.ZodDefault<z.ZodBoolean>>;

export const AnamnesisSchema = z.object({
  antecedentes: z
    .object({ ...antecedentesShape, otros: z.string().default("") })
    .default({}),
  medicacion_habitual: z.string().default(""),
  antecedentes_familiares: z.string().default(""),
  habitos: z.object({ ...habitosShape }).default({}),
  embarazo: z.enum(["no_aplica", "embarazada", "lactancia"]).default("no_aplica"),
  ultima_visita_odontologica: z.string().default(""),
  motivo_consulta: z.string().default(""),
  // Firma digital opcional (imagen PNG en data URL). Vacío = sin firma.
  firma: z.string().default(""),
  actualizado_por: z.string().default(""),
  actualizado_en: z.string().default(""),
});

export type Anamnesis = z.infer<typeof AnamnesisSchema>;

// El objeto vacío se deriva del propio schema parseando {} (aplica todos los defaults).
export const EMPTY_ANAMNESIS: Anamnesis = AnamnesisSchema.parse({});

// Normaliza cualquier valor (null, objeto parcial, basura) a un Anamnesis completo.
// safeParse aplica defaults y descarta claves desconocidas (strip por defecto).
export function parseAnamnesis(value: unknown): Anamnesis {
  const result = AnamnesisSchema.safeParse(value ?? {});
  return result.success ? result.data : EMPTY_ANAMNESIS;
}
