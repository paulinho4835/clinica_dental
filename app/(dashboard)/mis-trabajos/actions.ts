"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { canSeeNav } from "@/lib/rbac";

export type ActionState = { error?: string; ok?: boolean };

const WorkSchema = z.object({
  patient_id: z.string().uuid().optional().nullable(),
  patient_name: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().min(1, "Describe el trabajo realizado."),
  cost: z.coerce.number().min(0, "El costo no puede ser negativo."),
  commission_pct: z.coerce
    .number()
    .min(0, "El % no puede ser negativo.")
    .max(100, "El % no puede pasar de 100."),
  amount_paid: z.coerce.number().min(0, "El cobro no puede ser negativo."),
  payment_method: z.enum(["cash", "qr", "card"]).optional().nullable(),
  performed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  notes: z.string().trim().max(300).optional().nullable(),
  lab_work: z.string().trim().max(200).optional().nullable(),
  lab_cost: z.coerce.number().min(0, "El costo de laboratorio no puede ser negativo.").default(0),
  doctor_id: z.string().uuid().optional().nullable(),
  collected_by_id: z.string().uuid().optional().nullable(),
});

export async function createDoctorWork(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canSeeNav(profile.role, "mis_trabajos"))
    return { error: "Sin permiso para registrar trabajos." };

  const isRecepcionista = profile.role === "recepcionista";

  const parsed = WorkSchema.safeParse({
    patient_id: formData.get("patient_id") || null,
    patient_name: formData.get("patient_name") || null,
    description: formData.get("description"),
    cost: formData.get("cost") || 0,
    commission_pct: formData.get("commission_pct") || 0,
    amount_paid: formData.get("amount_paid") || 0,
    payment_method: formData.get("payment_method") || null,
    performed_at: formData.get("performed_at"),
    notes: formData.get("notes") || null,
    lab_work: formData.get("lab_work") || null,
    lab_cost: formData.get("lab_cost") || 0,
    doctor_id: formData.get("doctor_id") || null,
    collected_by_id: formData.get("collected_by_id") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const d = parsed.data;
  if (!d.patient_id && !d.patient_name)
    return { error: "Indica el paciente (registrado o por nombre)." };

  const insertData = {
    patient_id: d.patient_id ?? null,
    patient_name: d.patient_id ? null : d.patient_name,
    description: d.description,
    cost: d.cost,
    commission_pct: d.commission_pct,
    amount_paid: d.amount_paid,
    payment_method: d.amount_paid > 0 ? d.payment_method ?? "cash" : null,
    performed_at: d.performed_at,
    notes: d.notes ?? null,
    lab_work: d.lab_work ?? null,
    lab_cost: d.lab_cost ?? 0,
  };

  if (isRecepcionista) {
    if (!d.doctor_id) return { error: "Selecciona el doctor que realizó el trabajo." };
    const admin = createAdminClient();
    // Verificar que el doctor pertenece a la misma clínica.
    const { data: doctorProfile } = await admin
      .from("profiles")
      .select("clinic_id")
      .eq("id", d.doctor_id)
      .single();
    if (!doctorProfile || doctorProfile.clinic_id !== profile.clinicId)
      return { error: "Doctor no encontrado en tu clínica." };
    const { error } = await admin.from("doctor_works").insert({
      clinic_id: profile.clinicId,
      doctor_id: d.doctor_id,
      collected_by_id: d.collected_by_id ?? null,
      ...insertData,
    });
    if (error) return { error: error.message };
  } else {
    // commission_amount es columna generada en la DB: no se envía.
    const supabase = await createClient();
    const { error } = await supabase.from("doctor_works").insert({
      clinic_id: profile.clinicId,
      doctor_id: profile.userId,
      ...insertData,
    });
    if (error) return { error: error.message };
  }

  revalidatePath("/mis-trabajos");
  return { ok: true };
}

export async function deleteDoctorWork(id: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin")
    return { error: "Solo el administrador puede eliminar trabajos." };

  const supabase = await createClient();
  // RLS garantiza que un doctor solo borre lo suyo (admin puede borrar todo).
  const { error } = await supabase.from("doctor_works").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/mis-trabajos");
  return { ok: true };
}
