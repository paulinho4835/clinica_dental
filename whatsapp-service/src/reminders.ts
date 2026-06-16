import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const BOLIVIA_TZ = "America/La_Paz";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ReminderRow = {
  id: string;
  appointments: {
    starts_at: string;
    status: string;
    dentist_name: string | null;
    reason: string | null;
    patient_name: string | null;
    patients: { full_name: string | null; phone: string | null } | null;
    clinics: { name: string | null } | null;
  } | null;
};

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  d = d.replace(/^0+/, "");
  if (d.startsWith("591")) return d;
  if (d.length === 8 && /^[67]/.test(d)) return "591" + d;
  if (d.length >= 9) return d;
  return null;
}

async function markFailed(id: string) {
  await supabase
    .from("appointment_reminders")
    .update({ status: "failed" })
    .eq("id", id);
}

export async function processReminders(
  sendFn: (phone: string, message: string) => Promise<void>,
  clinicId: string
) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("appointment_reminders")
    .select(
      "id, appointments(starts_at, status, dentist_name, reason, patient_name, patients(full_name, phone), clinics(name))"
    )
    .eq("status", "pending")
    .eq("clinic_id", clinicId)
    .lte("scheduled_for", now)
    .limit(100);

  if (error) {
    console.error(`[${clinicId}] Error consultando recordatorios:`, error.message);
    return;
  }

  const due = (data ?? []) as unknown as ReminderRow[];

  if (due.length === 0) {
    console.log(`[${clinicId}] Sin recordatorios pendientes.`);
    return;
  }

  console.log(`[${clinicId}] Procesando ${due.length} recordatorio(s)...`);
  let sent = 0, failed = 0, skipped = 0;

  for (const r of due) {
    const appt = r.appointments;

    if (!appt || appt.status === "cancelled") {
      await markFailed(r.id);
      skipped++;
      continue;
    }

    const normalized = normalizePhone(appt.patients?.phone);
    if (!normalized) {
      await markFailed(r.id);
      skipped++;
      continue;
    }

    const starts = new Date(appt.starts_at);
    const dateLabel = starts.toLocaleDateString("es-BO", {
      timeZone: BOLIVIA_TZ,
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
    const timeLabel = starts.toLocaleTimeString("es-BO", {
      timeZone: BOLIVIA_TZ,
      hour: "2-digit",
      minute: "2-digit",
    });

    const name = appt.patients?.full_name ?? appt.patient_name ?? "Estimado/a";
    const clinic = appt.clinics?.name ?? "la clínica";
    const dentist = appt.dentist_name ? `con *${appt.dentist_name}* ` : "";
    const reason = appt.reason ? `\nMotivo: _${appt.reason}_` : "";

    const message =
      `Hola ${name} 👋, te recordamos tu cita ${dentist}` +
      `en *${clinic}* el *${dateLabel}* a las *${timeLabel}*.` +
      `${reason}\n\n¡Te esperamos! 🦷`;

    try {
      await sendFn(normalized, message);
      await supabase
        .from("appointment_reminders")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", r.id);
      console.log(`[${clinicId}]   ✅ ${normalized} — ${name}`);
      sent++;
    } catch (e) {
      console.error(`[${clinicId}]   ❌ ${normalized}:`, e instanceof Error ? e.message : e);
      await markFailed(r.id);
      failed++;
    }
  }

  console.log(`[${clinicId}] Listo: ${sent} enviados, ${failed} fallidos, ${skipped} omitidos.`);
}
