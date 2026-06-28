"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelPendingReminders } from "@/lib/reminders";
import { checkRateLimit, clientIp, tooManyRequestsMessage } from "@/lib/ratelimit";

export type ConfirmState = { ok?: boolean; error?: string; status?: string };

// Acción pública (sin sesión): el paciente confirma o cancela su cita desde el
// enlace del recordatorio. Se identifica solo por el `confirm_token`, que es
// imposible de adivinar. Usa service-role porque no hay usuario autenticado.
export async function respondToAppointment(
  token: string,
  action: "confirm" | "cancel",
): Promise<ConfirmState> {
  if (!token) return { error: "Enlace no válido." };

  // Sin sesión: limitar por IP para frenar el sondeo de tokens.
  const { ok, retryAfterSeconds } = await checkRateLimit("public-form", clientIp(await headers()));
  if (!ok) return { error: tooManyRequestsMessage(retryAfterSeconds) };

  const admin = createAdminClient();

  const { data: appt } = await admin
    .from("appointments")
    .select("id, status, starts_at")
    .eq("confirm_token", token)
    .maybeSingle();

  if (!appt) return { error: "No encontramos tu cita. El enlace puede ser inválido." };

  // Cita ya cancelada: no se puede confirmar ni volver a cancelar.
  if (appt.status === "cancelled")
    return { error: "Esta cita ya fue cancelada.", status: "cancelled" };

  // Cita ya atendida o en curso: ya no tiene sentido confirmarla/cancelarla.
  if (["finished", "in_chair", "waiting"].includes(appt.status))
    return { error: "Esta cita ya está en curso o fue atendida.", status: appt.status };

  const nextStatus = action === "confirm" ? "confirmed" : "cancelled";

  const { error } = await admin
    .from("appointments")
    .update({
      status: nextStatus,
      confirmed_at: action === "confirm" ? new Date().toISOString() : null,
    })
    .eq("id", appt.id);

  if (error) return { error: "No se pudo registrar tu respuesta. Intenta de nuevo." };

  // Si cancela, no tiene sentido seguir enviándole recordatorios pendientes.
  if (action === "cancel") {
    await cancelPendingReminders(admin, appt.id);
  }

  return { ok: true, status: nextStatus };
}
