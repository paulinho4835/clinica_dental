"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { AnamnesisSchema, parseAnamnesis } from "@/lib/schemas/anamnesis";
import { PatientIntakeSchema } from "@/lib/schemas/patient-intake";
import { checkRateLimit, clientIp, tooManyRequestsMessage } from "@/lib/ratelimit";

export type SubmitState = { error?: string; ok?: boolean };

function csvToArray(v: FormDataEntryValue | null): string[] {
  if (!v) return [];
  return String(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// Envío PÚBLICO del formulario de historial. No hay sesión: la autorización
// la da exclusivamente el token. Usa service-role. Reglas:
//   1. El token debe existir, no estar expirado y no estar usado.
//   2. Lo que envía el paciente queda como PROPUESTA en la invitación
//      (submitted_*), NO entra al expediente: la clínica lo revisa y aplica.
//   3. Tras enviar, el token se marca como usado (un solo uso).
export async function submitPublicAnamnesis(
  token: string,
  _prev: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  if (!token) return { error: "Enlace inválido." };

  // Sin sesión: limitar por IP para frenar el sondeo de tokens.
  const { ok, retryAfterSeconds } = await checkRateLimit("public-form", clientIp(await headers()));
  if (!ok) return { error: tooManyRequestsMessage(retryAfterSeconds) };

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("anamnesis_invitations")
    .select("id, kind, patient_id, clinic_id, expires_at, completed_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return { error: "Este enlace no es válido." };
  if (invite.completed_at)
    return { error: "Este formulario ya fue completado. Gracias." };
  if (new Date(invite.expires_at).getTime() < Date.now())
    return { error: "Este enlace expiró. Solicite uno nuevo a la clínica." };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("anamnesis") ?? "{}"));
  } catch {
    return { error: "Datos del formulario inválidos." };
  }

  const parsed = AnamnesisSchema.safeParse(raw);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  // Sellar autor/fecha: lo completó el propio paciente. Queda como propuesta.
  const data = {
    ...parseAnamnesis(parsed.data),
    actualizado_por: "Paciente (formulario en línea)",
    actualizado_en: new Date().toISOString(),
  };

  // En altas, validar y guardar también los datos personales.
  let submittedPersonal: Record<string, unknown> | null = null;
  if (invite.kind === "new") {
    let personRaw: unknown;
    try {
      personRaw = JSON.parse(String(formData.get("personal") ?? "{}"));
    } catch {
      return { error: "Datos personales inválidos." };
    }
    const person = PatientIntakeSchema.safeParse(personRaw);
    if (!person.success)
      return {
        error: person.error.issues[0]?.message ?? "Datos personales inválidos.",
      };
    submittedPersonal = person.data;
  }

  // Guardar la propuesta en la invitación + marcar como enviada (un solo uso).
  // No se crea/toca el paciente: la clínica decide aplicar o descartar.
  const { error: saveError } = await admin
    .from("anamnesis_invitations")
    .update({
      submitted_data: data,
      submitted_personal: submittedPersonal,
      submitted_allergies: csvToArray(formData.get("allergies")),
      submitted_alerts: csvToArray(formData.get("medical_alerts")),
      completed_at: new Date().toISOString(),
    })
    .eq("id", invite.id);
  if (saveError) return { error: saveError.message };

  return { ok: true };
}
