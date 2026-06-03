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

const ItemSchema = z
  .object({
    patient_id: z.string().uuid(),
    phase_id: z.string().uuid("Fase requerida"),
    procedure_id: z.string().uuid().optional().nullable(),
    custom_name: z.string().trim().min(1).optional().nullable(),
    tooth_fdi: z.string().optional().nullable(),
    price: z.coerce.number().min(0, "Precio inválido"),
    dentist_id: z.string().uuid().optional().nullable(),
  })
  .refine((d) => d.procedure_id || d.custom_name, {
    message: "Elige un procedimiento o escribe su nombre",
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
    procedure_id: formData.get("procedure_id") || null,
    custom_name: formData.get("custom_name") || null,
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
    custom_name: parsed.data.custom_name,
    tooth_fdi: parsed.data.tooth_fdi,
    price: parsed.data.price,
    dentist_id: parsed.data.dentist_id,
  });
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${parsed.data.patient_id}`);
  return { ok: true };
}

// --- Flujo simplificado: un solo campo (descripción) + precio ---------------
const WorkSchema = z.object({
  patient_id: z.string().uuid(),
  description: z.string().trim().min(1, "Escribe el trabajo a realizar"),
  price: z.coerce.number().min(0, "Precio inválido"),
  doctor_id: z.string().uuid().optional().nullable(),
});

// Agrega un trabajo al plan. Crea plan + fase automáticamente si no existen.
// La fecha/hora queda en treatment_items.created_at (default now()).
export async function addPlanWork(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write")) return { error: "Sin permiso clínico." };

  const parsed = WorkSchema.safeParse({
    patient_id: formData.get("patient_id"),
    description: formData.get("description"),
    price: formData.get("price"),
    doctor_id: formData.get("doctor_id") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();

  // Plan más reciente del paciente, o crea uno.
  let planId: string | undefined;
  const { data: plan } = await supabase
    .from("treatment_plans")
    .select("id")
    .eq("patient_id", parsed.data.patient_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  planId = plan?.id;

  if (!planId) {
    const { data: newPlan, error: planErr } = await supabase
      .from("treatment_plans")
      .insert({
        clinic_id: profile.clinicId,
        patient_id: parsed.data.patient_id,
        status: "active",
        created_by: profile.userId,
      })
      .select("id")
      .single();
    if (planErr || !newPlan) return { error: planErr?.message ?? "No se pudo crear el plan." };
    planId = newPlan.id;
  }

  // Primera fase del plan, o créala.
  let phaseId: string | undefined;
  const { data: phase } = await supabase
    .from("treatment_phases")
    .select("id")
    .eq("plan_id", planId)
    .order("phase_no", { ascending: true })
    .limit(1)
    .maybeSingle();
  phaseId = phase?.id;

  if (!phaseId) {
    const { data: newPhase, error: phErr } = await supabase
      .from("treatment_phases")
      .insert({ clinic_id: profile.clinicId, plan_id: planId, phase_no: 1, title: "General" })
      .select("id")
      .single();
    if (phErr || !newPhase) return { error: phErr?.message ?? "No se pudo crear la fase." };
    phaseId = newPhase.id;
  }

  const { error } = await supabase.from("treatment_items").insert({
    clinic_id: profile.clinicId,
    phase_id: phaseId,
    custom_name: parsed.data.description,
    price: parsed.data.price,
    status: "proposed",
    doctor_id: parsed.data.doctor_id ?? null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${parsed.data.patient_id}`);
  return { ok: true };
}

// Marca un trabajo como realizado (✓) o pendiente (✗).
export async function setWorkDone(
  itemId: string,
  done: boolean,
  patientId: string,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write")) return { error: "Sin permiso clínico." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("treatment_items")
    .update({
      status: done ? "done" : "proposed",
      done_at: done ? new Date().toISOString() : null,
    })
    .eq("id", itemId);
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

// Elimina un trabajo del plan.
export async function deleteWork(itemId: string, patientId: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write")) return { error: "Sin permiso clínico." };

  const supabase = await createClient();
  const { error } = await supabase.from("treatment_items").delete().eq("id", itemId);
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${patientId}`);
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
