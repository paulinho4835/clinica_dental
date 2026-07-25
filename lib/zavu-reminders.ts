// Procesador de recordatorios vía Zavu (reemplazará whatsapp-service/src/reminders.ts)
// Misma lógica de consulta a Supabase, distinto canal de envío.
//
// Diferencias vs Baileys:
//   - No necesita servicio local corriendo
//   - No necesita QR ni PC encendida
//   - Usa plantilla aprobada por Meta (messageType: "template")
//   - Corre directamente desde Vercel (ver instrucciones de cron al final del archivo)

import { createClient } from "@supabase/supabase-js";
import { sendWhatsAppTemplate } from "@/lib/zavu";
import { normalizePhone } from "@/lib/phone-utils";

const BOLIVIA_TZ = "America/La_Paz";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
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


async function markSent(id: string) {
  await supabase
    .from("appointment_reminders")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", id);
}

async function markFailed(id: string) {
  await supabase
    .from("appointment_reminders")
    .update({ status: "failed" })
    .eq("id", id);
}

// clinicId: si se pasa, procesa SOLO los recordatorios de esa clínica (uso
// manual desde el dashboard — un admin de la clínica A no debe poder disparar
// el envío de recordatorios de la clínica B). Sin clinicId, procesa TODAS las
// clínicas — solo el cron de Vercel (contexto de servidor confiable) debe
// invocarlo así.
export async function processRemindersZavu(clinicId?: string): Promise<{
  sent: number;
  failed: number;
  skipped: number;
}> {
  const now = new Date().toISOString();

  let query = supabase
    .from("appointment_reminders")
    .select(
      "id, appointments(starts_at, status, dentist_name, reason, patient_name, patients(full_name, phone), clinics(name))"
    )
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .limit(100);
  if (clinicId) query = query.eq("clinic_id", clinicId);

  const { data, error } = await query;

  if (error) {
    console.error("[zavu-reminders] Error consultando recordatorios:", error.message);
    return { sent: 0, failed: 0, skipped: 0 };
  }

  const due = (data ?? []) as unknown as ReminderRow[];

  if (due.length === 0) {
    console.log("[zavu-reminders] Sin recordatorios pendientes.");
    return { sent: 0, failed: 0, skipped: 0 };
  }

  console.log(`[zavu-reminders] Procesando ${due.length} recordatorio(s)...`);
  let sent = 0, failed = 0, skipped = 0;

  for (const r of due) {
    const appt = r.appointments;

    if (!appt || appt.status === "cancelled") {
      await markFailed(r.id);
      skipped++;
      continue;
    }

    const phone = normalizePhone(appt.patients?.phone);
    if (!phone) {
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

    const name    = appt.patients?.full_name ?? appt.patient_name ?? "Estimado/a";
    const clinic  = appt.clinics?.name ?? "la clínica";
    const dentist = appt.dentist_name ?? "";

    // Variables de la plantilla Meta aprobada.
    // Deben coincidir EXACTAMENTE con los {{1}}, {{2}}... que enviaste a Meta.
    const templateVariables: Record<string, string> = {
      "1": name,
      "2": clinic,
      "3": dateLabel,
      "4": timeLabel,
      "5": dentist,
    };

    const result = await sendWhatsAppTemplate(phone, templateVariables);

    if (result.ok) {
      await markSent(r.id);
      console.log(`[zavu-reminders] ✅ ${phone} — ${name} (id: ${result.messageId})`);
      sent++;
    } else {
      console.error(`[zavu-reminders] ❌ ${phone} — ${name}: ${result.error}`);
      await markFailed(r.id);
      failed++;
    }
  }

  console.log(`[zavu-reminders] Listo: ${sent} enviados, ${failed} fallidos, ${skipped} omitidos.`);
  return { sent, failed, skipped };
}

// =============================================================================
// CRON EN VERCEL (activar cuando se migre de Baileys a Zavu)
// =============================================================================
// Agregar a vercel.json:
//
// {
//   "crons": [
//     {
//       "path": "/api/whatsapp/send-reminders-zavu",
//       "schedule": "0 13 * * *"
//     }
//   ]
// }
//
// "0 13 * * *" = 13:00 UTC = 09:00 Bolivia (UTC-4)
// Vercel crons usan UTC siempre.
// =============================================================================
