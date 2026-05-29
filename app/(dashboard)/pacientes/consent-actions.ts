"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { CONSENT_TEMPLATES } from "@/lib/consents/templates";

export type ActionState = { error?: string; ok?: boolean };

const ConsentSchema = z.object({
  patient_id: z.string().uuid(),
  template_code: z.string().min(1),
  signed_by_name: z.string().min(1, "Nombre de quien firma requerido"),
});

export async function createConsent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const profile = await getProfile();
  if (!profile) return { error: "Sesión expirada." };
  // Consentimiento es acto clínico; lo registra quien atiende.
  if (!can(profile.role, "clinical:write"))
    return { error: "Sin permiso para registrar consentimientos." };

  const parsed = ConsentSchema.safeParse({
    patient_id: formData.get("patient_id"),
    template_code: formData.get("template_code"),
    signed_by_name: formData.get("signed_by_name"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const template = CONSENT_TEMPLATES[parsed.data.template_code];
  if (!template) return { error: "Plantilla inválida." };

  const signedAt = new Date().toISOString();
  const contentText = template.body;
  // Hash de integridad: sha256(texto || patient_id || signed_at). Sin imágenes.
  const contentHash = createHash("sha256")
    .update(contentText + parsed.data.patient_id + signedAt)
    .digest("hex");

  const supabase = await createClient();
  const { error } = await supabase.from("informed_consents").insert({
    clinic_id: profile.clinicId,
    patient_id: parsed.data.patient_id,
    template_code: parsed.data.template_code,
    content_text: contentText,
    content_hash: contentHash,
    signed_by_name: parsed.data.signed_by_name,
    signed_at: signedAt,
  });
  if (error) return { error: error.message };

  revalidatePath(`/pacientes/${parsed.data.patient_id}`);
  return { ok: true };
}
