import { z } from "zod";

export const PatientSchema = z.object({
  full_name: z.string().trim().min(1, "Nombre requerido"),
  national_id: z.string().trim().optional().nullable(),
  dob: z.string().optional().nullable(),
  sex: z.string().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z
    .string()
    .email("Email inválido")
    .optional()
    .or(z.literal("")),
  address: z.string().trim().optional().nullable(),
  allergies: z.string().optional().nullable(),
  medical_alerts: z.string().optional().nullable(),
});

export type PatientInput = z.infer<typeof PatientSchema>;
