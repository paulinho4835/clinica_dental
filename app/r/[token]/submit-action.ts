"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { WorkFeedbackSchema } from "@/lib/schemas/work-feedback";
import { checkRateLimit, clientIp, tooManyRequestsMessage } from "@/lib/ratelimit";

export type SubmitFeedbackState = { error?: string; ok?: boolean };

// Envío PÚBLICO de la calificación. No hay sesión: la autorización la da
// exclusivamente el token. Usa service-role. Reglas:
//   1. El token debe existir, no estar expirado y no estar usado.
//   2. La calificación se guarda en la propia fila (rating/comfort/comment).
//   3. Tras enviar, el token se marca como usado (un solo uso).
export async function submitWorkFeedback(
  token: string,
  _prev: SubmitFeedbackState,
  formData: FormData,
): Promise<SubmitFeedbackState> {
  if (!token) return { error: "Enlace inválido." };

  // Sin sesión: limitar por IP para frenar el sondeo de tokens.
  const { ok, retryAfterSeconds } = await checkRateLimit("public-form", clientIp(await headers()));
  if (!ok) return { error: tooManyRequestsMessage(retryAfterSeconds) };

  const admin = createAdminClient();

  const { data: invite } = await admin
    .from("work_feedback")
    .select("id, expires_at, submitted_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) return { error: "Este enlace no es válido." };
  if (invite.submitted_at)
    return { error: "Esta calificación ya fue enviada. ¡Gracias!" };
  if (new Date(invite.expires_at).getTime() < Date.now())
    return { error: "Este enlace expiró. Solicite uno nuevo a la clínica." };

  const comfortRaw = String(formData.get("comfort") ?? "");
  const parsed = WorkFeedbackSchema.safeParse({
    rating: formData.get("rating"),
    comfort: comfortRaw || undefined,
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const { error: saveError } = await admin
    .from("work_feedback")
    .update({
      rating: parsed.data.rating,
      comfort: parsed.data.comfort ?? null,
      comment: parsed.data.comment || null,
      submitted_at: new Date().toISOString(),
    })
    .eq("id", invite.id);
  if (saveError) return { error: saveError.message };

  return { ok: true };
}
