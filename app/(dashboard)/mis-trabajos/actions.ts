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
  treatment_lab_cost: z.coerce.number().min(0).default(0),
  doctor_id: z.string().uuid().optional().nullable(),
  collected_by_id: z.string().uuid().optional().nullable(),
  treatment_item_id: z.string().uuid().optional().nullable(),
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
    treatment_lab_cost: formData.get("treatment_lab_cost") || 0,
    doctor_id: formData.get("doctor_id") || null,
    collected_by_id: formData.get("collected_by_id") || null,
    treatment_item_id: formData.get("treatment_item_id") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const d = parsed.data;
  if (!d.patient_id && !d.patient_name)
    return { error: "Indica el paciente (registrado o por nombre)." };

  // Admin se asigna a sí mismo como "cobrado por" si no se indicó otro.
  const resolvedCollectedById =
    d.collected_by_id ?? (profile.role === "admin" ? profile.userId : null);

  const paymentMethod = d.amount_paid > 0 ? (d.payment_method ?? "cash") : null;

  const insertData = {
    patient_id: d.patient_id ?? null,
    patient_name: d.patient_id ? null : d.patient_name,
    description: d.description,
    cost: d.cost,
    commission_pct: d.commission_pct,
    amount_paid: d.amount_paid,
    payment_method: paymentMethod,
    performed_at: d.performed_at,
    notes: d.notes ?? null,
    lab_work: d.lab_work ?? null,
    lab_cost: d.lab_cost ?? 0,
    treatment_lab_cost: d.treatment_lab_cost ?? 0,
    treatment_item_id: d.treatment_item_id ?? null,
    collected_by_id: resolvedCollectedById,
  };

  let actualDoctorId: string;

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
    actualDoctorId = d.doctor_id;
    const { error } = await admin.from("doctor_works").insert({
      clinic_id: profile.clinicId,
      doctor_id: d.doctor_id,
      ...insertData,
    });
    if (error) return { error: error.message };
  } else {
    actualDoctorId = profile.userId;
    const supabase = await createClient();
    const { error } = await supabase.from("doctor_works").insert({
      clinic_id: profile.clinicId,
      doctor_id: profile.userId,
      ...insertData,
    });
    if (error) return { error: error.message };
  }

  // Si se cobró algo a un paciente registrado, reflejar también en payments
  // para que aparezca en el historial de pagos del paciente.
  if (d.amount_paid > 0 && d.patient_id && paymentMethod) {
    const supabase = await createClient();
    await supabase.from("payments").insert({
      clinic_id: profile.clinicId,
      patient_id: d.patient_id,
      amount: d.amount_paid,
      method: paymentMethod,
      kind: "payment",
      doctor_id: actualDoctorId,
      commission_pct: d.commission_pct,
      note: d.description,
      collected_by_id: resolvedCollectedById,
      treatment_item_id: d.treatment_item_id ?? null,
    });
  }

  revalidatePath("/mis-trabajos");
  if (d.patient_id) revalidatePath(`/pacientes/${d.patient_id}`);
  return { ok: true };
}

const EditSchema = z.object({
  description: z.string().trim().min(1, "Describe el trabajo realizado."),
  cost: z.coerce.number().min(0),
  commission_pct: z.coerce.number().min(0).max(100),
  amount_paid: z.coerce.number().min(0),
  payment_method: z.enum(["cash", "qr", "card"]).optional().nullable(),
  performed_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  notes: z.string().trim().max(300).optional().nullable(),
  lab_work: z.string().trim().max(200).optional().nullable(),
  lab_cost: z.coerce.number().min(0).default(0),
});

export async function updateDoctorWork(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin") return { error: "Solo el administrador puede editar trabajos." };

  const parsed = EditSchema.safeParse({
    description: formData.get("description"),
    cost: formData.get("cost") || 0,
    commission_pct: formData.get("commission_pct") || 0,
    amount_paid: formData.get("amount_paid") || 0,
    payment_method: formData.get("payment_method") || null,
    performed_at: formData.get("performed_at"),
    notes: formData.get("notes") || null,
    lab_work: formData.get("lab_work") || null,
    lab_cost: formData.get("lab_cost") || 0,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const d = parsed.data;
  const paymentMethod = d.amount_paid > 0 ? (d.payment_method ?? "cash") : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("doctor_works")
    .update({
      description: d.description,
      cost: d.cost,
      commission_pct: d.commission_pct,
      amount_paid: d.amount_paid,
      payment_method: paymentMethod,
      performed_at: d.performed_at,
      notes: d.notes ?? null,
      lab_work: d.lab_work ?? null,
      lab_cost: d.lab_cost,
    })
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);

  if (error) return { error: error.message };

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
