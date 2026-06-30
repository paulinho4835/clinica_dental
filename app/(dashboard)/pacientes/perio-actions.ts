"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { withinClinicalHours } from "@/lib/clinicalHours";
import { getClinicFeatures } from "@/lib/superadmin";
import type { PerioMeasurements } from "@/lib/perio/types";

export type ActionState = { error?: string; ok?: boolean };

// Admin, doctores y colega pueden registrar periodontogramas (NO recepcionista).
// Mismo conjunto de roles que el odontograma.
const PERIO_ROLES = ["admin", "odontologo_general", "especialista", "colega"] as const;
function canEditPerio(role: string | undefined): boolean {
  return PERIO_ROLES.includes(role as (typeof PERIO_ROLES)[number]);
}

// Bloqueo horario (addon "bloqueo_horario"): los doctores solo editan dentro de
// la ventana de la clínica; el admin queda exento. Devuelve un mensaje de error
// si está fuera de horario, o null si puede editar.
async function clinicalHoursGuard(
  supabase: Awaited<ReturnType<typeof createClient>>,
  role: string,
  clinicId: string,
): Promise<string | null> {
  if (role === "admin") return null;
  const features = await getClinicFeatures();
  if (!features.bloqueo_horario) return null;
  const { data: clinic } = await supabase
    .from("clinics")
    .select("settings")
    .eq("id", clinicId)
    .single();
  if (!withinClinicalHours(clinic?.settings)) {
    return "Fuera del horario de edición permitido. El periodontograma está en modo lectura.";
  }
  return null;
}

export async function savePerioExam(input: {
  examId?: string | null; // si viene, edita; si no, crea uno nuevo
  patientId: string;
  examDate: string; // YYYY-MM-DD
  measurements: PerioMeasurements;
  diagnosis: string;
  notes: string;
}): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canEditPerio(profile.role))
    return { error: "Solo los doctores y el administrador pueden registrar periodontogramas." };
  if (!input.examDate) return { error: "Falta la fecha del examen." };

  const supabase = await createClient();

  const hoursError = await clinicalHoursGuard(supabase, profile.role, profile.clinicId);
  if (hoursError) return { error: hoursError };

  if (input.examId) {
    // Editar un examen existente (mismo día, correcciones). El filtro por
    // clinic_id es redundante con RLS pero explícito (aislamiento por código).
    const { error } = await supabase
      .from("perio_exams")
      .update({
        exam_date: input.examDate,
        measurements: input.measurements,
        diagnosis: input.diagnosis,
        notes: input.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.examId)
      .eq("clinic_id", profile.clinicId);
    if (error) return { error: error.message };
  } else {
    const { error } = await supabase.from("perio_exams").insert({
      clinic_id: profile.clinicId,
      patient_id: input.patientId,
      exam_date: input.examDate,
      author_id: profile.userId,
      author_name: profile.fullName,
      measurements: input.measurements,
      diagnosis: input.diagnosis,
      notes: input.notes,
    });
    if (error) return { error: error.message };
  }

  revalidatePath(`/pacientes/${input.patientId}`);
  return { ok: true };
}

// Solo el admin puede borrar un examen periodontal (registro clínico).
export async function deletePerioExam(
  examId: string,
  patientId: string,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (profile.role !== "admin")
    return { error: "Solo el administrador puede eliminar un examen periodontal." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("perio_exams")
    .delete()
    .eq("id", examId)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}
