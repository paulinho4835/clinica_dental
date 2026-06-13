"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";

export type ConsentActionResult = { error?: string; id?: string };

export async function createConsent(
  patientId: string,
  params: {
    templateId: string | null;
    title: string;
    body: string;
    appointmentId: string | null;
    signatureData: string | null;
    status: "pendiente" | "firmado";
  }
): Promise<ConsentActionResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write")) return { error: "Sin permiso clínico." };

  const title = params.title.trim();
  const body = params.body.trim();
  if (!title) return { error: "El título es requerido." };
  if (!body) return { error: "El cuerpo del consentimiento es requerido." };
  if (params.status === "firmado" && !params.signatureData) {
    return { error: "Se requiere firma para guardar como firmado." };
  }

  const supabase = await createClient();

  const { data: patientExists } = await supabase
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .single();
  if (!patientExists) return { error: "Paciente no encontrado." };

  const { data, error } = await supabase
    .from("consents")
    .insert({
      clinic_id: profile.clinicId,
      patient_id: patientId,
      template_id: params.templateId ?? null,
      appointment_id: params.appointmentId ?? null,
      title,
      body,
      created_by: profile.userId,
      signature_data: params.signatureData ?? null,
      signed_at: params.status === "firmado" ? new Date().toISOString() : null,
      status: params.status,
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Error al guardar el consentimiento." };

  revalidatePath(`/pacientes/${patientId}`);
  return { id: data.id };
}

export async function deleteConsent(
  consentId: string,
  patientId: string
): Promise<ConsentActionResult> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  if (!can(profile.role, "clinical:write")) return { error: "Sin permiso clínico." };

  const supabase = await createClient();

  const { error } = await supabase
    .from("consents")
    .delete()
    .eq("id", consentId);

  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${patientId}`);
  return {};
}
