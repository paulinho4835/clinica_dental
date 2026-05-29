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
