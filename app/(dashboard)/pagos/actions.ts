"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export type ActionState = { error?: string; ok?: boolean };

const StaffPaymentSchema = z.object({
  employee_id: z.string().uuid("Selecciona un empleado."),
  amount: z.coerce.number().positive("El monto debe ser mayor a 0."),
  method: z.enum(["cash", "qr", "card"]),
  concept: z.string().trim().max(200).optional().nullable(),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
});

export async function createStaffPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Sin permiso." };

  const parsed = StaffPaymentSchema.safeParse({
    employee_id: formData.get("employee_id"),
    amount: formData.get("amount"),
    method: formData.get("method"),
    concept: formData.get("concept") || null,
    paid_at: formData.get("paid_at"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const workIds = formData.getAll("work_ids").map(String).filter(Boolean);

  const d = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("staff_payments").insert({
    clinic_id: profile.clinicId,
    employee_id: d.employee_id,
    amount: d.amount,
    method: d.method,
    concept: d.concept ?? null,
    paid_at: d.paid_at,
  });
  if (error) return { error: error.message };

  if (workIds.length > 0) {
    await supabase
      .from("doctor_works")
      .update({ commission_paid: true })
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
