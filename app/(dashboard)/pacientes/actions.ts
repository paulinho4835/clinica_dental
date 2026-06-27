"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PatientSchema } from "@/lib/schemas/patient";
import { withinClinicalHours } from "@/lib/clinicalHours";
import { getClinicFeatures } from "@/lib/superadmin";
import { isR2Configured, deleteObject } from "@/lib/r2";

export type ActionState = { error?: string; ok?: boolean };

// ¿El registro clínico está bloqueado por horario para este usuario?
// Solo aplica si el addon "bloqueo_horario" está activo para la clínica.
// El admin queda exento; los doctores solo editan dentro de la ventana de la clínica.
async function clinicalLocked(role: string, clinicId: string): Promise<boolean> {
  if (role === "admin") return false;
  const features = await getClinicFeatures();
  if (!features.bloqueo_horario) return false; // addon apagado → sin bloqueo
  const supabase = await createClient();
  const { data: clinic } = await supabase
    .from("clinics")
    .select("settings")
    .eq("id", clinicId)
    .single();
  return !withinClinicalHours(clinic?.settings);
}

// Convierte "a, b ,c" -> ["a","b","c"] (ignora vacíos). Para alergias/alertas.
function csvToArray(v: FormDataEntryValue | null): string[] {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createPatient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "patients:write"))
    return { error: "Sin permiso para crear pacientes." };

  const parsed = PatientSchema.safeParse({
    full_name: formData.get("full_name"),
    national_id: formData.get("national_id") || null,
    dob: formData.get("dob") || null,
    sex: formData.get("sex") || null,
    phone: formData.get("phone") || null,
    email: formData.get("email") || "",
    address: formData.get("address") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.from("patients").insert({
    clinic_id: profile.clinicId, // RLS verifica que coincida con el JWT
    full_name: parsed.data.full_name,
    national_id: parsed.data.national_id || null,
    dob: parsed.data.dob,
    sex: parsed.data.sex,
    phone: parsed.data.phone,
    email: parsed.data.email || null,
    address: parsed.data.address,
    allergies: csvToArray(formData.get("allergies")),
    medical_alerts: csvToArray(formData.get("medical_alerts")),
  });
  if (error) return { error: error.message };

  revalidatePath("/pacientes");
  return { ok: true };
}

export async function updatePatient(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };

  // Solo admin, doctores y colega editan pacientes (recepcionista y asistente NO).
  // Colega edita como doctor: solo alergias y alertas médicas.
  const isDoctor =
    profile.role === "odontologo_general" ||
    profile.role === "especialista" ||
    profile.role === "colega";
  const isAdmin = profile.role === "admin";
  if (!isAdmin && !isDoctor)
    return { error: "Sin permiso para editar pacientes." };

  // Los doctores solo pueden modificar alergias y alertas médicas; el resto de
  // datos personales (nombre, CI, teléfono, email, dirección…) queda intacto,
  // aunque el request los incluya.
  if (isDoctor) {
    const supabase = await createClient();
    const { error } = await supabase
      .from("patients")
      .update({
        allergies: csvToArray(formData.get("allergies")),
        medical_alerts: csvToArray(formData.get("medical_alerts")),
      })
      .eq("id", id)
      .eq("clinic_id", profile.clinicId);
    if (error) return { error: error.message };
    revalidatePath(`/pacientes/${id}`);
    return { ok: true };
  }

  const parsed = PatientSchema.safeParse({
    full_name: formData.get("full_name"),
    national_id: formData.get("national_id") || null,
    dob: formData.get("dob") || null,
    sex: formData.get("sex") || null,
    phone: formData.get("phone") || null,
    email: formData.get("email") || "",
    address: formData.get("address") || null,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("patients")
    .update({
      full_name: parsed.data.full_name,
      national_id: parsed.data.national_id || null,
      dob: parsed.data.dob,
      sex: parsed.data.sex,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      address: parsed.data.address,
      allergies: csvToArray(formData.get("allergies")),
      medical_alerts: csvToArray(formData.get("medical_alerts")),
    })
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${id}`);
  return { ok: true };
}

// ── Notas de evolución (firmadas por autor) ──────────────────────────────────
// Solo admin y doctores pueden anotar. Cada nota queda firmada con el nombre del
// autor y SOLO su autor puede editarla/borrarla (reforzado además por RLS).

export type EvolutionNote = {
  id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  note_type: "free" | "soap";
  appointment_id: string | null;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  created_at: string;
  updated_at: string;
};

export type SoapFields = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

// Versión anterior de una nota (capturada por el trigger al editar/borrar).
export type EvolutionNoteHistory = {
  id: string;
  note_id: string;
  author_name: string;
  body: string;
  note_type: "free" | "soap" | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  action: "edited" | "deleted";
  changed_at: string;
};

// Roles con potestad de anotar evolución clínica (excluye recepcionista/asistente).
const EVOLUTION_ROLES = ["admin", "odontologo_general", "especialista", "colega"] as const;
function canWriteEvolution(role: string | undefined): boolean {
  return EVOLUTION_ROLES.includes(role as (typeof EVOLUTION_ROLES)[number]);
}

export async function addEvolutionNote(
  patientId: string,
  body: string,
  opts?: { appointmentId?: string | null; soap?: SoapFields },
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canWriteEvolution(profile.role))
    return { error: "Solo los doctores y el administrador pueden anotar evolución." };
  if (await clinicalLocked(profile.role, profile.clinicId))
    return { error: "Fuera del horario de edición permitido. La evolución está en modo lectura." };

  const isSoap = !!opts?.soap;
  const text = body.trim();

  if (!isSoap && !text) return { error: "La nota no puede estar vacía." };
  if (isSoap) {
    const s = opts!.soap!;
    const hasContent = [s.subjective, s.objective, s.assessment, s.plan].some(
      (v) => v.trim(),
    );
    if (!hasContent) return { error: "Completa al menos un campo de la nota SOAP." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("patient_evolution_notes").insert({
    patient_id: patientId,
    clinic_id: profile.clinicId,
    author_id: profile.userId,
    author_name: profile.fullName,
    body: isSoap ? "" : text,
    note_type: isSoap ? "soap" : "free",
    appointment_id: opts?.appointmentId ?? null,
    subjective: opts?.soap?.subjective?.trim() ?? "",
    objective: opts?.soap?.objective?.trim() ?? "",
    assessment: opts?.soap?.assessment?.trim() ?? "",
    plan: opts?.soap?.plan?.trim() ?? "",
  });
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

export async function updateEvolutionNote(
  noteId: string,
  patientId: string,
  body: string,
  opts?: { soap?: SoapFields },
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canWriteEvolution(profile.role))
    return { error: "Sin permiso para editar evolución." };
  if (await clinicalLocked(profile.role, profile.clinicId))
    return { error: "Fuera del horario de edición permitido. La evolución está en modo lectura." };

  const isSoap = !!opts?.soap;
  const text = body.trim();
  if (!isSoap && !text) return { error: "La nota no puede estar vacía." };

  const updatePayload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (isSoap) {
    updatePayload.subjective = opts!.soap!.subjective.trim();
    updatePayload.objective  = opts!.soap!.objective.trim();
    updatePayload.assessment = opts!.soap!.assessment.trim();
    updatePayload.plan       = opts!.soap!.plan.trim();
  } else {
    updatePayload.body = text;
  }

  const supabase = await createClient();
  // RLS ya impide editar notas ajenas; el filtro por author_id es defensa extra.
  const { data, error } = await supabase
    .from("patient_evolution_notes")
    .update(updatePayload)
    .eq("id", noteId)
    .eq("author_id", profile.userId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length)
    return { error: "Solo puedes editar tus propias notas." };

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

export async function deleteEvolutionNote(
  noteId: string,
  patientId: string,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!canWriteEvolution(profile.role))
    return { error: "Sin permiso para borrar evolución." };
  if (await clinicalLocked(profile.role, profile.clinicId))
    return { error: "Fuera del horario de edición permitido. La evolución está en modo lectura." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patient_evolution_notes")
    .delete()
    .eq("id", noteId)
    .eq("author_id", profile.userId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length)
    return { error: "Solo puedes borrar tus propias notas." };

  revalidatePath(`/pacientes/${patientId}`);
  return { ok: true };
}

export async function deletePatient(id: string): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "patients:delete"))
    return { error: "Sin permiso para eliminar pacientes." };

  const supabase = await createClient();

  // Antes de borrar al paciente: borrar sus fotos en R2. El `on delete cascade`
  // limpia las filas de patient_photos, pero NO los objetos en R2 → quedarían
  // huérfanos pagando almacenamiento. Se hace ANTES del delete (después ya no
  // tendríamos los storage_key).
  if (isR2Configured()) {
    const { data: photoRows } = await supabase
      .from("patient_photos")
      .select("storage_key")
      .eq("patient_id", id)
      .eq("clinic_id", profile.clinicId);
    await Promise.all(
      (photoRows ?? []).map((p) =>
        deleteObject(p.storage_key as string).catch(() => {
          /* si un objeto falla, seguimos: no bloquear el borrado del paciente */
        }),
      ),
    );
  }

  const { error } = await supabase
    .from("patients")
    .delete()
    .eq("id", id)
    .eq("clinic_id", profile.clinicId);

  if (error) {
    if (error.code === "23503")
      return {
        error:
          "No se puede eliminar: el paciente tiene citas, facturas o pagos registrados. Elimínalos primero.",
      };
    return { error: error.message };
  }

  revalidatePath("/pacientes");
  return { ok: true };
}

// Registro rápido desde la agenda: crea un paciente con lo mínimo (nombre + CI
// + teléfono) y DEVUELVE su id para vincularlo a la cita en el acto.
const QuickPatientSchema = z.object({
  full_name: z.string().trim().min(1, "Nombre requerido"),
  national_id: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
});

export async function createPatientQuick(input: {
  full_name: string;
  national_id?: string | null;
  phone?: string | null;
}): Promise<{ patientId?: string; error?: string }> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "patients:write"))
    return { error: "Sin permiso para crear pacientes." };

  const parsed = QuickPatientSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patients")
    .insert({
      clinic_id: profile.clinicId,
      full_name: parsed.data.full_name,
      national_id: parsed.data.national_id || null,
      phone: parsed.data.phone || null,
    })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "No se pudo registrar." };

  revalidatePath("/pacientes");
  return { patientId: data.id };
}
