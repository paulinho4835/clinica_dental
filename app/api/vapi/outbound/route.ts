import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { triggerReminderCall } from "@/lib/vapi";
import { normalizePhone } from "@/lib/whatsapp";
import { BOLIVIA_TZ } from "@/lib/format";

// POST /api/vapi/outbound
//
// Dispara una llamada de recordatorio para una cita específica.
// Solo admins pueden usar este endpoint.
//
// Body: { appointmentId: string }
//
// Devuelve: { ok: true, callId: string } | { error: string }

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Solo admins autenticados.
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Sin permiso." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const appointmentId: string | undefined = body?.appointmentId;
  if (!appointmentId) {
    return NextResponse.json({ error: "appointmentId requerido." }, { status: 400 });
  }

  const supabase = await createClient();

  // Cargar la cita con paciente y clínica.
  const { data: appt, error: apptErr } = await supabase
    .from("appointments")
    .select(
      "id, starts_at, status, clinic_id, patients(full_name, phone), clinics(name)",
    )
    .eq("id", appointmentId)
    .eq("clinic_id", profile.clinicId) // RLS extra: solo la clínica del admin
    .maybeSingle();

  if (apptErr || !appt) {
    return NextResponse.json({ error: "Cita no encontrada." }, { status: 404 });
  }

  if (appt.status === "cancelled" || appt.status === "finished") {
    return NextResponse.json({ error: "La cita ya está cancelada o finalizada." }, { status: 422 });
  }

  const patient = appt.patients as unknown as { full_name: string | null; phone: string | null } | null;
  const phone = normalizePhone(patient?.phone ?? null);

  if (!phone) {
    return NextResponse.json(
      { error: "El paciente no tiene teléfono registrado o el formato es inválido." },
      { status: 422 },
    );
  }

  // Buscar (o crear) el registro de recordatorio para esta cita.
  const admin = createAdminClient();
  let reminderId: string;

  const { data: existing } = await admin
    .from("appointment_reminders")
    .select("id")
    .eq("appointment_id", appointmentId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) {
    reminderId = existing.id;
  } else {
    const { data: created, error: createErr } = await admin
      .from("appointment_reminders")
      .insert({
        clinic_id: profile.clinicId,
        appointment_id: appointmentId,
        channel: "vapi",
        scheduled_for: new Date().toISOString(),
        status: "pending",
      })
      .select("id")
      .single();

    if (createErr || !created) {
      return NextResponse.json({ error: "Error al crear el recordatorio." }, { status: 500 });
    }
    reminderId = created.id;
  }

  // Formatear fecha/hora en zona Bolivia.
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
    hour12: false,
  });

  const clinicName =
    (appt.clinics as unknown as { name: string | null } | null)?.name ?? "la clínica";
  const patientName = patient?.full_name ?? "paciente";

  // Disparar la llamada via Vapi.
  const result = await triggerReminderCall({
    to: phone,
    patientName,
    clinicName,
    dateLabel,
    timeLabel,
    appointmentId,
    reminderId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Guardar el callId en el recordatorio para trazabilidad.
  if (result.callId) {
    await admin
      .from("appointment_reminders")
      .update({ vapi_call_id: result.callId })
      .eq("id", reminderId);
  }

  return NextResponse.json({ ok: true, callId: result.callId });
}
