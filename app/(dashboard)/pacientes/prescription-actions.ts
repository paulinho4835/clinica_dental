"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type Medication = {
  name: string;
  dosage: string;
  instructions: string;
};

export type PrescriptionRow = {
  id: string;
  doctorName: string | null;
  medications: Medication[];
  notes: string | null;
  issuedAt: string; // ISO
};

export function validateMedications(meds: Medication[]): string | null {
  if (meds.length === 0) return "Agrega al menos un medicamento.";
  for (const m of meds) {
    if (!m.name.trim()) return "El nombre del medicamento es requerido.";
    if (!m.dosage.trim()) return "La dosis del medicamento es requerida.";
  }
  return null;
}

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
