"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type ActionState = { error?: string; ok?: boolean };

const PaymentSchema = z.object({
  patient_id: z.string().uuid(),
  amount: z.coerce.number().positive("Monto debe ser > 0"),
  method: z.enum(["cash", "qr"]),
  doctor_id: z.string().uuid().optional().nullable(),
  note: z.string().max(120).optional().nullable(),
});

// Registra un pago/adelanto del paciente desde la ficha.
// El trigger payment_to_ledger crea el movimiento de cuenta automáticamente.
export async function addPatientPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "billing:write"))
    return { error: "Sin permiso para registrar pagos." };

  const parsed = PaymentSchema.safeParse({
    patient_id: formData.get("patient_id"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    doctor_id: formData.get("doctor_id") || null,
    note: formData.get("note") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({
    clinic_id: profile.clinicId,
    patient_id: parsed.data.patient_id,
    amount: parsed.data.amount,
    method: parsed.data.method,
    kind: "payment",
    doctor_id: parsed.data.doctor_id ?? null,
    note: parsed.data.note ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${parsed.data.patient_id}`);
  return { ok: true };
}
