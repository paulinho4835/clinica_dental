"use server";

import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { isReceptionistLike } from "@/lib/rbac";

export type FeedbackInviteState =
  | {
      ok: true;
      url: string;
      patientName: string;
      patientPhone: string | null;
      clinicName: string;
    }
  | { ok: false; error: string };

// Días de validez del enlace de calificación. La opinión se pide poco después
// del trabajo, pero damos margen por si el paciente tarda en responder.
const EXPIRES_DAYS = 14;

function buildToken(): string {
  return randomBytes(32).toString("base64url");
}

// Genera (o reutiliza) una invitación de calificación para un trabajo y devuelve
// la URL pública + datos para armar el mensaje de WhatsApp. El enlace se entrega
// manualmente (copiar / WhatsApp): no envía nada por sí solo.
//
// Solo admin y recepcionista pueden generarlo (son quienes contactan al paciente
// y ven su teléfono). El doctor ve los resultados, pero no envía.
export async function createWorkFeedbackInvitation(
  workId: string,
  force = false,
): Promise<FeedbackInviteState> {
  const profile = await getProfile();
  if (!profile) return { ok: false, error: "Sesión expirada." };

  const canSend = profile.role === "admin" || isReceptionistLike(profile.role);
  if (!canSend)
    return { ok: false, error: "Sin permiso para pedir calificaciones." };

  const supabase = await createClient();

  // El trabajo debe pertenecer a la clínica del usuario (defensa en profundidad
  // además de RLS). Traemos doctor/paciente para vincular la calificación.
  const { data: work } = await supabase
    .from("doctor_works")
    .select(
      "id, doctor_id, patient_id, patient_name, clinic_id, patients(full_name, phone)",
    )
    .eq("id", workId)
    .eq("clinic_id", profile.clinicId)
    .maybeSingle();
  if (!work) return { ok: false, error: "Trabajo no encontrado." };

  const { data: clinic } = await supabase
    .from("clinics")
    .select("name")
    .eq("id", profile.clinicId)
    .maybeSingle();

  const patientRel = work.patients as
    | { full_name?: string; phone?: string | null }
    | { full_name?: string; phone?: string | null }[]
    | null;
  const patient = Array.isArray(patientRel) ? patientRel[0] : patientRel;
  const patientName =
    patient?.full_name ?? (work.patient_name as string | null) ?? "";
  const patientPhone = patient?.phone ?? null;

  const nowIso = new Date().toISOString();

  if (force) {
    // Regenerar: invalidar enlaces pendientes (no respondidos) borrándolos.
    await supabase
      .from("work_feedback")
      .delete()
      .eq("work_id", workId)
      .is("submitted_at", null);
  } else {
    // Reutilizar la invitación pendiente vigente si existe.
    const { data: existing } = await supabase
      .from("work_feedback")
      .select("token")
      .eq("work_id", workId)
      .is("submitted_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.token)
      return {
        ok: true,
        url: `/r/${existing.token}`,
        patientName,
        patientPhone,
        clinicName: clinic?.name ?? "la clínica",
      };
  }

  const token = buildToken();
  const expiresAt = new Date(
    Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await supabase.from("work_feedback").insert({
    token,
    work_id: workId,
    doctor_id: (work.doctor_id as string | null) ?? null,
    patient_id: (work.patient_id as string | null) ?? null,
    clinic_id: profile.clinicId,
    created_by: profile.userId,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    url: `/r/${token}`,
    patientName,
    patientPhone,
    clinicName: clinic?.name ?? "la clínica",
  };
}
