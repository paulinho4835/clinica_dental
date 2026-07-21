import { z } from "zod";

// Opciones de "¿Cómo nos conociste?" mostradas en el registro por WhatsApp.
export const REFERRAL_SOURCE_OPTIONS = [
  { value: "facebook", label: "Facebook" },
  { value: "tiktok", label: "TikTok" },
  { value: "instagram", label: "Instagram" },
  { value: "recomendacion", label: "Recomendación de un amigo o familiar" },
  { value: "otro", label: "Otro" },
] as const;

export const REFERRAL_SOURCE_LABEL: Record<string, string> = Object.fromEntries(
  REFERRAL_SOURCE_OPTIONS.map((o) => [o.value, o.label]),
);

// Datos personales que el paciente llena al auto-registrarse (invitación de alta).
// Solo el nombre es obligatorio; el resto es opcional y se normaliza a "".
export const PatientIntakeSchema = z.object({
  full_name: z.string().trim().min(1, "El nombre es obligatorio"),
  national_id: z.string().trim().default(""),
  dob: z.string().trim().default(""), // ISO (yyyy-mm-dd) o ""
  sex: z.string().trim().default(""),
  email: z.string().trim().default(""),
  address: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  referral_source: z.string().trim().default(""), // valor de REFERRAL_SOURCE_OPTIONS o ""
  referral_source_other: z.string().trim().default(""), // solo si referral_source = "otro"
});

export type PatientIntake = z.infer<typeof PatientIntakeSchema>;

// Plantilla en blanco (full_name es obligatorio en el schema, así que no se
// puede derivar parseando {}).
export const EMPTY_INTAKE: PatientIntake = {
  full_name: "",
  national_id: "",
  dob: "",
  sex: "",
  email: "",
  address: "",
  phone: "",
  referral_source: "",
  referral_source_other: "",
};

export function parseIntake(value: unknown): PatientIntake {
  const result = PatientIntakeSchema.safeParse(value ?? {});
  return result.success ? result.data : EMPTY_INTAKE;
}
