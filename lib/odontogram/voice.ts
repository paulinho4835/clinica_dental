import { z } from "zod";
import {
  CONDITION_LABELS,
  QUADRANTS,
  SURFACE_CONDITIONS,
  WHOLE_CONDITIONS,
  type Surface,
  type TeethMap,
  type ToothState,
} from "./types";
import { PEDIATRIC_QUADRANTS } from "./pediatricTypes";

export type Dentition = "permanent" | "pediatric";

const surfaceSchema = z.enum(["O", "M", "D", "V", "L"]);
const surfaceConditionSchema = z.enum(SURFACE_CONDITIONS);
const wholeConditionSchema = z.enum([...WHOLE_CONDITIONS, "x_rojo", "x_azul"] as const);

const setSurfaceSchema = z
  .object({
    action: z.literal("set_surface"),
    tooth: z.string(),
    surface: surfaceSchema,
    condition: surfaceConditionSchema,
  })
  .strict();

const setWholeSchema = z
  .object({
    action: z.literal("set_whole"),
    tooth: z.string(),
    condition: wholeConditionSchema,
  })
  .strict();

const clearSurfaceSchema = z
  .object({ action: z.literal("clear_surface"), tooth: z.string(), surface: surfaceSchema })
  .strict();

const clearWholeSchema = z.object({ action: z.literal("clear_whole"), tooth: z.string() }).strict();

export const voiceOperationSchema = z.discriminatedUnion("action", [
  setSurfaceSchema,
  setWholeSchema,
  clearSurfaceSchema,
  clearWholeSchema,
]);

/** Contrato cerrado entre el intérprete y el dominio clínico. */
export const voiceOperationsSchema = z.array(voiceOperationSchema).max(20);

export type VoiceOperation = z.infer<typeof voiceOperationSchema>;

const teethForDentition: Record<Dentition, ReadonlySet<string>> = {
  permanent: new Set(QUADRANTS.flat()),
  pediatric: new Set(PEDIATRIC_QUADRANTS.flat()),
};

export type VoiceOperationValidation =
  | { valid: true; operation: VoiceOperation }
  | { valid: false; operation: unknown; reason: string };

/**
 * Valida cada propuesta de forma independiente para que la API pueda conservar
 * las válidas y convertir las demás en advertencias, sin aplicar nada dudoso.
 */
export function validateVoiceOperations(
  operations: unknown,
  dentition: Dentition = "permanent",
): VoiceOperationValidation[] {
  if (!Array.isArray(operations)) {
    return [{ valid: false, operation: operations, reason: "Las operaciones deben ser una lista." }];
  }

  if (operations.length > 20) {
    return operations.map((operation) => ({
      valid: false as const,
      operation,
      reason: "Se permiten como máximo 20 operaciones por dictado.",
    }));
  }

  const allowedTeeth = teethForDentition[dentition];
  return operations.map((operation) => {
    const parsed = voiceOperationSchema.safeParse(operation);
    if (!parsed.success) {
      return {
        valid: false as const,
        operation,
        reason: "La operación no cumple el formato clínico permitido.",
      };
    }

    if (!allowedTeeth.has(parsed.data.tooth)) {
      return {
        valid: false as const,
        operation,
        reason: `El diente ${parsed.data.tooth} no pertenece a la dentición seleccionada.`,
      };
    }

    return { valid: true as const, operation: parsed.data };
  });
}

const DEFAULT_TOOTH: ToothState = { present: true, whole: null, surfaces: {} };

/** Aplica propuestas en orden, sin mutar el mapa ni estados previos. */
export function applyVoiceOperations(teeth: TeethMap, operations: readonly VoiceOperation[]): TeethMap {
  let next = teeth;

  for (const operation of operations) {
    const current = next[operation.tooth] ?? DEFAULT_TOOTH;
    let updated: ToothState;

    switch (operation.action) {
      case "set_surface":
        updated = {
          ...current,
          surfaces: { ...current.surfaces, [operation.surface]: operation.condition },
        };
        break;
      case "clear_surface": {
        const surfaces = { ...current.surfaces };
        delete surfaces[operation.surface];
        updated = { ...current, surfaces };
        break;
      }
      case "set_whole":
        updated = { ...current, whole: operation.condition };
        break;
      case "clear_whole":
        updated = { ...current, whole: null };
        break;
    }

    next = { ...next, [operation.tooth]: updated };
  }

  return next;
}

const SURFACE_LABELS: Record<Surface, string> = {
  O: "oclusal",
  M: "mesial",
  D: "distal",
  V: "vestibular",
  L: "lingual/palatina",
};

export function describeVoiceOperation(operation: VoiceOperation): string {
  const tooth = `Diente ${operation.tooth}`;
  if (operation.action === "set_surface") {
    return `${tooth}: ${CONDITION_LABELS[operation.condition]} en cara ${SURFACE_LABELS[operation.surface]}.`;
  }
  if (operation.action === "clear_surface") {
    return `${tooth}: borrar cara ${SURFACE_LABELS[operation.surface]}.`;
  }
  if (operation.action === "set_whole") {
    const label = operation.condition === "x_rojo" ? "Marca X requerida" : operation.condition === "x_azul" ? "Marca X existente" : CONDITION_LABELS[operation.condition];
    return `${tooth}: ${label}.`;
  }
  return `${tooth}: borrar condición de diente completo.`;
}

/** Normalizaciones léxicas seguras; no interpreta diagnósticos ni números FDI. */
export function normalizeDentalTerms(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\bbucal\b/g, "vestibular")
    .replace(/\bpalatino\b/g, "lingual")
    .replace(/\boclusal\b/g, "O")
    .replace(/\bmesial\b/g, "M")
    .replace(/\bdistal\b/g, "D")
    .replace(/\bvestibular\b/g, "V")
    .replace(/\blingual\b/g, "L");
}
