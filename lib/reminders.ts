import type { SupabaseClient } from "@supabase/supabase-js";

type ReminderInsert = {
  clinic_id: string;
  appointment_id: string;
  channel: "whatsapp";
  scheduled_for: string;
  hours_before: number;
};

const TIMINGS = [
  { key: "reminders_h24", hours: 24, defaultOn: true },
  { key: "reminders_h2",  hours: 2,  defaultOn: false },
] as const;

/**
 * Calcula las filas a insertar en appointment_reminders según la config de la clínica.
 * Retorna solo las filas para timings habilitados.
 * Si el scheduled_for ya pasó (cita en menos tiempo del reminder), usa `now`.
 */
export function buildReminderRows(
  clinicId: string,
  appointmentId: string,
  startsAt: Date,
  settings: Record<string, unknown>,
): ReminderInsert[] {
  const now = new Date();
  const rows: ReminderInsert[] = [];

  for (const t of TIMINGS) {
    const enabled = t.defaultOn
      ? settings[t.key] !== false
      : settings[t.key] === true;
    if (!enabled) continue;

    const remindAt = new Date(startsAt.getTime() - t.hours * 60 * 60 * 1000);
    rows.push({
      clinic_id: clinicId,
      appointment_id: appointmentId,
      channel: "whatsapp",
      scheduled_for: (remindAt > now ? remindAt : now).toISOString(),
      hours_before: t.hours,
    });
  }

  return rows;
}

/**
 * Cancela los recordatorios pendientes de una cita antes de reinsertar
 * (al reagendar) o de marcar la cita como cancelada.
 * Solo toca filas con status='pending'; las ya enviadas quedan intactas.
 */
export async function cancelPendingReminders(
  supabase: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  await supabase
    .from("appointment_reminders")
    .update({ status: "cancelled" })
    .eq("appointment_id", appointmentId)
    .eq("status", "pending");
}
