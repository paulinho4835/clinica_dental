import { z } from "zod";

export const PaymentSchema = z.object({
  patient_id: z.string().uuid("Selecciona un paciente"),
  amount: z.coerce
    .number({ invalid_type_error: "Monto requerido" })
    .positive("Monto debe ser mayor a 0"),
  method: z.enum(["cash", "qr", "card"]),
  kind: z.enum(["payment", "credit"]).default("payment"),
  note: z.string().max(120).optional().nullable(),
  doctor_id: z.string().uuid().optional().nullable(),
  commission_pct: z.coerce.number().min(0).max(100).default(0),
});

export type PaymentInput = z.infer<typeof PaymentSchema>;
