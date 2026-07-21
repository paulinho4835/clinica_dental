import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureFreshAccessToken } from "@/lib/google-calendar/tokens";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/lib/google-calendar/client";
import { buildEventTitle, buildEventDescription } from "@/lib/google-calendar/eventContent";

export type SyncAction = "create" | "update" | "cancel" | "delete";

// Nunca propaga errores: un fallo de Google no debe romper la acción de la
// recepcionista. No hay cola de trabajos en este proyecto, así que esto se
// awaitea inline en cada acción de agenda/actions.ts — pero como nunca lanza,
// el caller no ve ni error ni rollback, solo la latencia real de 1-2 llamadas
// HTTP a Google (o ninguna, si el doctor no está conectado).
export async function syncAppointmentToGoogle(
  appointmentId: string,
  action: SyncAction,
): Promise<void> {
  try {
    await run(appointmentId, action);
  } catch (err) {
    console.error(`google-calendar sync (${action}) falló para cita ${appointmentId}:`, err);
  }
}

async function run(appointmentId: string, action: SyncAction): Promise<void> {
  const admin = createAdminClient();
  const { data: appt, error: selectError } = await admin
    .from("appointments")
    .select(
      "id, dentist_id, patient_name, reason, starts_at, ends_at, status, google_event_id, patients(full_name, phone)",
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (selectError) {
    console.error(`google-calendar sync: error al leer cita ${appointmentId}:`, selectError);
  }
  if (!appt || !appt.dentist_id) return; // sin doctor asignado, nada que sincronizar

  const accessToken = await ensureFreshAccessToken(appt.dentist_id);
  if (!accessToken) return; // doctor no conectado (o se acaba de desconectar)

  if (action === "delete") {
    if (appt.google_event_id) await deleteCalendarEvent(accessToken, appt.google_event_id);
    return;
  }

  // create/update/cancel comparten el mismo upsert: si ya existe google_event_id
  // se hace PATCH, si no se crea. "cancel" es solo un update donde el status ya
  // es 'cancelled' -> el título sale con el prefijo [Cancelado].
  const patient = appt.patients as { full_name?: string; phone?: string | null } | null;
  const patientName = patient?.full_name ?? appt.patient_name ?? "Paciente";
  const event = {
    title: buildEventTitle(patientName, appt.reason, appt.status === "cancelled"),
    description: buildEventDescription(patient?.phone ?? null),
    startsAt: appt.starts_at,
    endsAt: appt.ends_at,
  };

  if (appt.google_event_id) {
    await updateCalendarEvent(accessToken, appt.google_event_id, event);
    return;
  }

  const eventId = await createCalendarEvent(accessToken, event);
  const { error: updateError } = await admin
    .from("appointments")
    .update({ google_event_id: eventId })
    .eq("id", appointmentId);
  if (updateError) {
    console.error(
      `google-calendar sync: se creó el evento ${eventId} en Google pero falló al guardar google_event_id en la cita ${appointmentId}:`,
      updateError,
    );
  }
}

// Backfill: crea eventos para las citas futuras activas de un doctor recién
// conectado. Se llama una sola vez, desde el callback de OAuth.
export async function backfillDoctorAppointments(dentistId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: appts, error: selectError } = await admin
    .from("appointments")
    .select("id")
    .eq("dentist_id", dentistId)
    .in("status", ["scheduled", "confirmed"])
    .gte("starts_at", new Date().toISOString());
  if (selectError) {
    console.error(`google-calendar backfill: error al listar citas del doctor ${dentistId}:`, selectError);
  }

  for (const a of appts ?? []) {
    await syncAppointmentToGoogle(a.id, "create");
  }
}
