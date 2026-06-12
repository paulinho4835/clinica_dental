import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { BOLIVIA_TZ } from "@/lib/format";

// Endpoint llamado por Vercel Cron (ver vercel.json). Recorre los recordatorios
// pendientes cuya hora ya llegó y envía el WhatsApp al paciente.
// Usa el cliente service_role para saltar RLS (el cron no tiene sesión de usuario).
export const dynamic = "force-dynamic";

type ReminderRow = {
  id: string;
  appointment_id: string;
  appointments: {
    starts_at: string;
    status: string;
    dentist_name: string | null;
    patients: { full_name: string | null; phone: string | null } | null;
    clinics: { name: string | null } | null;
  } | null;
};

export async function GET(req: Request) {
  // Seguridad: Vercel Cron incluye 'Authorization: Bearer ${CRON_SECRET}'.
  // Si CRON_SECRET está definido, exigimos que coincida (bloquea curiosos).
  const secret = process.env.CRON_SECRET;
  // En producción el secret es obligatorio — Vercel Cron lo inyecta automáticamente.
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 });
  }
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  // Si WhatsApp aún no está configurado, no hacemos nada: NO marcamos los
  // recordatorios como fallidos (se quemarían antes de poder enviarlos).
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    return NextResponse.json({ skipped: "WhatsApp no configurado", processed: 0 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("appointment_reminders")
    .select(
      "id, appointment_id, appointments(starts_at, status, dentist_name, patients(full_name, phone), clinics(name))",
    )
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const due = (data ?? []) as unknown as ReminderRow[];
  let sent = 0,
    failed = 0,
    skipped = 0;

  for (const r of due) {
    const appt = r.appointments;

    // Cita inexistente o cancelada: no se envía y no se reintenta.
    if (!appt || appt.status === "cancelled") {
      await markFailed(supabase, r.id);
      skipped++;
      continue;
    }

    const phone = appt.patients?.phone;
    // Sólo pacientes registrados con teléfono (las consultas rápidas no tienen).
    if (!phone) {
      await markFailed(supabase, r.id);
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
    const clinicName = appt.clinics?.name ?? "la clínica";
    const patientName = appt.patients?.full_name ?? "paciente";

    // Parámetros posicionales de la plantilla: {{1}} nombre, {{2}} clínica,
    // {{3}} fecha, {{4}} hora. Deben coincidir con la plantilla aprobada en Meta.
    const res = await sendWhatsAppTemplate({
      phone,
      templateParams: [patientName, clinicName, dateLabel, timeLabel],
    });

    if (res.ok) {
      await supabase
        .from("appointment_reminders")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", r.id);
      sent++;
    } else {
      await markFailed(supabase, r.id);
      failed++;
    }
  }

  return NextResponse.json({ processed: due.length, sent, failed, skipped });
}

async function markFailed(
  supabase: ReturnType<typeof createAdminClient>,
  id: string,
): Promise<void> {
  await supabase.from("appointment_reminders").update({ status: "failed" }).eq("id", id);
}
