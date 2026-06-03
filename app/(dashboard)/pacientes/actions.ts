"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type ActionState = { error?: string; ok?: boolean };

// Convierte "a, b ,c" -> ["a","b","c"] (ignora vacíos). Para alergias/alertas.
function csvToArray(v: FormDataEntryValue | null): string[] {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const PatientSchema = z.object({
  full_name: z.string().min(1, "Nombre requerido"),
  national_id: z.string().optional().nullable(),
  dob: z.string().optional().nullable(),
  sex: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email("Email inválido").optional().or(z.literal("")),
  address: z.string().optional().nullable(),
});

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
  if (!can(profile.role, "patients:write"))
    return { error: "Sin permiso para editar pacientes." };

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
