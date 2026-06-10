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
  commission_pct: z.coerce.number().min(0).max(100).default(0),
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
    commission_pct: formData.get("commission_pct") || 0,
    note: formData.get("note") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const d = parsed.data;
  const supabase = await createClient();

  const { error } = await supabase.from("payments").insert({
    clinic_id: profile.clinicId,
    patient_id: d.patient_id,
    amount: d.amount,
    method: d.method,
    kind: "payment",
    doctor_id: d.doctor_id ?? null,
    commission_pct: d.commission_pct,
    note: d.note ?? null,
  });
  if (error) return { error: error.message };

  // Si hay doctor y comisión, registrar automáticamente en Mis trabajos.
  if (d.doctor_id && d.commission_pct > 0) {
    await supabase.from("doctor_works").insert({
      clinic_id: profile.clinicId,
      doctor_id: d.doctor_id,
      patient_id: d.patient_id,
      description: d.note ?? "Pago desde ficha de paciente",
      cost: d.amount,
      commission_pct: d.commission_pct,
      amount_paid: d.amount,
      payment_method: d.method,
      performed_at: new Date().toISOString().split("T")[0],
    });
  }

  revalidatePath(`/pacientes/${d.patient_id}`);
  revalidatePath("/mis-trabajos");
  return { ok: true };
}
