"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canEditAnamnesis } from "@/lib/rbac";
import { getClinicFeatures } from "@/lib/superadmin";
import { withinClinicalHours } from "@/lib/clinicalHours";
import { AnamnesisSchema, parseAnamnesis } from "@/lib/schemas/anamnesis";

export type ActionState = { error?: string; ok?: boolean };

// Mismo criterio que actions.ts: el admin queda exento; con el addon
// bloqueo_horario activo, los demás solo guardan dentro de la ventana clínica.
async function clinicalLocked(role: string, clinicId: string): Promise<boolean> {
  if (role === "admin") return false;
  const features = await getClinicFeatures();
  if (!features.bloqueo_horario) return false;
  const supabase = await createClient();
  const { data: clinic } = await supabase
    .from("clinics")
    .select("settings")
    .eq("id", clinicId)
    .single();
  return !withinClinicalHours(clinic?.settings);
}

function csvToArray(v: FormDataEntryValue | null): string[] {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function updateAnamnesis(
  patientId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canEditAnamnesis(profile.role))
    return { error: "Sin permiso para editar antecedentes médicos." };

  if (await clinicalLocked(profile.role, profile.clinicId))
    return { error: "Registro clínico bloqueado fuera del horario de la clínica." };

  // El cliente envía el JSON de la anamnesis en el campo "anamnesis".
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("anamnesis") ?? "{}"));
  } catch {
    return { error: "Datos de anamnesis inválidos." };
  }

  const parsed = AnamnesisSchema.safeParse(raw);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  // Sellar autor/fecha en el servidor (no confiar en el cliente).
  const data = {
    ...parseAnamnesis(parsed.data),
    actualizado_por: profile.fullName ?? "",
    actualizado_en: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("patients")
    .update({
      anamnesis_data: data,
      allergies: csvToArray(formData.get("allergies")),
      medical_alerts: csvToArray(formData.get("medical_alerts")),
    })
    .eq("id", patientId)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}
