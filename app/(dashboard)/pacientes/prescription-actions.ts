"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { type Medication, validateMedications } from "@/lib/prescriptions";

export type { Medication, PrescriptionRow } from "@/lib/prescriptions";

export async function createPrescription(
  patientId: string,
  medications: Medication[],
  notes: string,
): Promise<{ id: string } | { error: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write")) return { error: "Sin permiso clínico." };

  const validationError = validateMedications(medications);
  if (validationError) return { error: validationError };

  const supabase = await createClient();

  // Verify patient belongs to this clinic (RLS on patients enforces it)
  const { data: patientExists } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .single();
  if (!patientExists) return { error: "Paciente no encontrado." };

  const { data, error } = await supabase
    .from("prescriptions")
    .insert({
      clinic_id: profile.clinicId,
      patient_id: patientId,
      doctor_id: profile.userId,
      medications,
      notes: notes.trim() || null,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Error al guardar la receta." };

  revalidatePath(`/pacientes/${patientId}`);
  return { id: data.id };
}

export async function deletePrescription(
  patientId: string,
  prescriptionId: string,
): Promise<{ ok: true } | { error: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  // Mismo criterio que emitir recetas: admin, recepción, colega y odontólogos.
  if (!can(profile.role, "clinical:write")) return { error: "Sin permiso clínico." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("prescriptions")
    .delete()
    .eq("id", prescriptionId)
    .eq("clinic_id", profile.clinicId)
    .eq("patient_id", patientId);

  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}
