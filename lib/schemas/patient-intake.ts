import { z } from "zod";

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
};

export function parseIntake(value: unknown): PatientIntake {
  const result = PatientIntakeSchema.safeParse(value ?? {});
  return result.success ? result.data : EMPTY_INTAKE;
}
