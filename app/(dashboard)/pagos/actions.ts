"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ActionState = { error?: string; ok?: boolean };

const StaffPaymentSchema = z
  .object({
    // Exactamente uno: empleado con cuenta (profiles) o recepcionista sin cuenta.
    employee_id: z.string().uuid().optional().nullable(),
    receptionist_id: z.string().uuid().optional().nullable(),
    amount: z.coerce.number().positive("El monto debe ser mayor a 0."),
    method: z.enum(["cash", "qr", "card"]),
    concept: z.string().trim().max(200).optional().nullable(),
    paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  })
  .refine((d) => Boolean(d.employee_id) !== Boolean(d.receptionist_id), {
    message: "Selecciona a quién pagar.",
  });

export async function createStaffPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Sin permiso." };

  const parsed = StaffPaymentSchema.safeParse({
    employee_id: formData.get("employee_id") || null,
    receptionist_id: formData.get("receptionist_id") || null,
    amount: formData.get("amount"),
    method: formData.get("method"),
    concept: formData.get("concept") || null,
    paid_at: formData.get("paid_at"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const d = parsed.data;
  // Las comisiones solo aplican a empleados con cuenta (los trabajos clínicos se
  // registran contra un doctor_id de profiles). Una recepcionista no tiene works.
  const workIds = d.employee_id
    ? formData.getAll("work_ids").map(String).filter(Boolean)
    : [];

  const supabase = await createClient();
  const { data: paymentData, error } = await supabase
    .from("staff_payments")
    .insert({
      clinic_id: profile.clinicId,
      employee_id: d.employee_id ?? null,
      receptionist_id: d.receptionist_id ?? null,
      amount: d.amount,
      method: d.method,
      concept: d.concept ?? null,
      paid_at: d.paid_at,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  if (workIds.length > 0) {
    await supabase
      .from("doctor_works")
      .update({ commission_paid: true, staff_payment_id: paymentData?.id ?? null })
      .eq("clinic_id", profile.clinicId)
      .in("id", workIds);
  }

  revalidatePath("/pagos");
  revalidatePath("/mis-trabajos");
  return { ok: true };
}

export async function toggleDisbursed(id: string, disbursed: boolean): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Sin permiso." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_payments")
    .update({ disbursed })
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/pagos");
  return { ok: true };
}

export async function deleteStaffPayment(id: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Sin permiso." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_payments")
    .delete()
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath("/pagos");
  return { ok: true };
}
