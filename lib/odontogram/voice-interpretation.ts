import "server-only";
import { generateObject, type LanguageModel } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { deepseek } from "@ai-sdk/deepseek";
import { z } from "zod";
import { normalizeDentalTerms, voiceOperationsSchema, type Dentition, type VoiceOperation } from "./voice";

const interpretationSchema = z.object({
  operations: voiceOperationsSchema,
  uncertainties: z.array(z.string().min(1).max(300)).max(10),
}).strict();

export type VoiceInterpretation = z.infer<typeof interpretationSchema>;

function model(): LanguageModel {
  const provider = process.env.ODONTOGRAM_VOICE_PROVIDER ?? process.env.AGENT_PROVIDER;
  const name = process.env.ODONTOGRAM_VOICE_MODEL;
  if (provider === "groq" && process.env.GROQ_API_KEY) return createGroq({ apiKey: process.env.GROQ_API_KEY })(name ?? "llama-3.3-70b-versatile");
  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (provider === "google" && googleKey) return createGoogleGenerativeAI({ apiKey: googleKey })(name ?? "gemini-2.5-flash");
  if (provider === "openrouter" && process.env.OPENROUTER_API_KEY) {
    return createOpenAICompatible({ name: "openrouter", baseURL: "https://openrouter.ai/api/v1", apiKey: process.env.OPENROUTER_API_KEY })(name ?? "deepseek/deepseek-chat");
  }
  if (provider === "deepseek" && process.env.DEEPSEEK_API_KEY) return deepseek(name ?? "deepseek-chat");
  throw new Error("Interpretación de dictado no configurada.");
}

const allowedConditions = `
Caras: caries, caries_recidivante, resina, amalgama, sellante, fractura, desgaste.
Diente completo: corona, endodoncia, perno, implante, protesis, extraccion_indicada, ausente, movilidad, en_erupcion, x_rojo, x_azul.
Caras: O (oclusal), M (mesial), D (distal), V (vestibular/bucal), L (lingual/palatino).`;

export async function interpretOdontogramVoice(text: string, dentition: Dentition = "permanent"): Promise<VoiceInterpretation> {
  const fdi = dentition === "permanent" ? "11-18, 21-28, 31-38 y 41-48" : "51-55, 61-65, 71-75 y 81-85";
  const result = await generateObject({
    model: model(),
    schema: interpretationSchema,
    temperature: 0,
    maxRetries: 1,
    prompt: `Convierte el siguiente dictado odontológico en operaciones JSON para un odontograma ${dentition === "permanent" ? "permanente" : "temporal"}.
Solo extrae lo dicho explícitamente; no diagnostiques, no completes, no adivines dientes ni caras. Si algo es ambiguo, ponlo en uncertainties y NO crees una operación para ello. Nunca uses FDI fuera de: ${fdi}. Máximo 20 operaciones.
${allowedConditions}
Los verbos borrar/quitar/eliminar implican clear_surface o clear_whole.\n\nDictado normalizado: ${normalizeDentalTerms(text)}`,
  });
  return result.object;
}

export function validVoiceOperations(operations: VoiceOperation[]): VoiceOperation[] {
  return operations;
}
