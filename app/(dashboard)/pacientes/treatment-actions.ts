"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type ActionState = { error?: string; ok?: boolean };

// Crea un plan de tratamiento con una fase inicial "General".
export async function createPlan(patientId: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write"))
    return { error: "Sin permiso clínico." };

  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from("treatment_plans")
    .insert({ clinic_id: profile.clinicId, patient_id: patientId, created_by: profile.userId })
    .select("id")
    .single();
  if (error || !plan) return { error: error?.message ?? "No se pudo crear el plan." };

  const { error: phErr } = await supabase.from("treatment_phases").insert({
    clinic_id: profile.clinicId,
    plan_id: plan.id,
    phase_no: 1,
    title: "General",
  });
  if (phErr) return { error: phErr.message };

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

const ItemSchema = z.object({
  patient_id: z.string().uuid(),
  phase_id: z.string().uuid("Fase requerida"),
  procedure_id: z.string().uuid("Procedimiento requerido"),
  tooth_fdi: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Precio inválido"),
  dentist_id: z.string().uuid().optional().nullable(),
});

export async function addPlanItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write"))
    return { error: "Sin permiso clínico." };

  const parsed = ItemSchema.safeParse({
    patient_id: formData.get("patient_id"),
    phase_id: formData.get("phase_id"),
    procedure_id: formData.get("procedure_id"),
    tooth_fdi: formData.get("tooth_fdi") || null,
    price: formData.get("price"),
    dentist_id: formData.get("dentist_id") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.from("treatment_items").insert({
    clinic_id: profile.clinicId,
    phase_id: parsed.data.phase_id,
    procedure_id: parsed.data.procedure_id,
    tooth_fdi: parsed.data.tooth_fdi,
    price: parsed.data.price,
    dentist_id: parsed.data.dentist_id,
  });
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${parsed.data.patient_id}`);
  return { ok: true };
}

const STATUSES = ["proposed", "approved", "in_progress", "done", "cancelled"] as const;

// Cambiar estado de un item. Pasar a 'done' dispara el trigger que genera
// la comisión del odontólogo y descuenta inventario.
export async function setItemStatus(
  itemId: string,
  status: string,
  patientId: string,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write")) return { error: "Sin permiso." };
  if (!STATUSES.includes(status as (typeof STATUSES)[number]))
    return { error: "Estado inválido." };

  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "done") patch.done_at = new Date().toISOString();

  const { error } = await supabase.from("treatment_items").update(patch).eq("id", itemId);
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}
