import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getClinicFeatures } from "@/lib/superadmin";

export const maxDuration = 300;

const WA_URL = process.env.WA_SERVICE_URL ?? "http://localhost:3001";

// GET /api/whatsapp/bulk?date=YYYY-MM-DD
// Retorna la lista de citas del día con teléfonos y mensaje preview.
export async function GET(req: NextRequest) {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
  if (!can(profile?.role, "appointments:write")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  if (!features.wa_masivo || !features.whatsapp) {
    return NextResponse.json({ error: "Módulo no habilitado" }, { status: 403 });
  }

  const dateParam = req.nextUrl.searchParams.get("date"); // YYYY-MM-DD
  const supabase = await createClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("name")
    .eq("id", profile!.clinicId)
    .single();

  const base = dateParam
    ? new Date(`${dateParam}T00:00:00-04:00`)
    : (() => {
        const t = new Date();
        t.setDate(t.getDate() + 1);
        const y = t.toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
        return new Date(`${y}T00:00:00-04:00`);
      })();

  const dayStart = base.toISOString();
  const dayEnd = new Date(base.getTime() + 24 * 60 * 60_000).toISOString();

  const dateLabel = base.toLocaleDateString("es-BO", {
    timeZone: "America/La_Paz",
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const { data: appts, error } = await supabase
    .from("appointments")
    .select("id, starts_at, dentist_name, reason, patient_name, patients(full_name, phone)")
    .eq("clinic_id", profile!.clinicId)
    .gte("starts_at", dayStart)
    .lt("starts_at", dayEnd)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clinicName = clinic?.name ?? "Clínica Dental";

  const list = (appts ?? []).map((a) => {
    const p = a.patients as { full_name?: string; phone?: string } | null;
    const name = p?.full_name ?? a.patient_name ?? "Paciente";
    const phone = p?.phone ?? null;
    const time = new Date(a.starts_at).toLocaleTimeString("es-BO", {
      timeZone: "America/La_Paz",
      hour: "2-digit",
      minute: "2-digit",
    });
    const dr = a.dentist_name ? ` con ${a.dentist_name}` : "";
    const mot = a.reason ? ` (${a.reason})` : "";
    const text =
      `Hola ${name}, le recordamos su cita dental el ${dateLabel} a las ${time}${dr}${mot}. ` +
      `${clinicName}. Ante cualquier consulta estamos a su disposición. ¡Hasta pronto! 🦷`;

    return { id: a.id, name, phone, time, dentistName: a.dentist_name ?? null, text };
  });

  return NextResponse.json({ clinicName, dateLabel, appts: list });
}

// POST /api/whatsapp/bulk
// Body: { messages: [{phone, text}][], delayMs?: number }
export async function POST(req: NextRequest) {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
  if (!can(profile?.role, "appointments:write")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  if (!features.wa_masivo || !features.whatsapp) {
    return NextResponse.json({ error: "Módulo no habilitado" }, { status: 403 });
  }
  if (!profile?.clinicId) {
    return NextResponse.json({ error: "Sin clínica" }, { status: 400 });
  }

  const { messages, delayMs = 5000 } = await req.json() as {
    messages: Array<{ phone: string; text: string }>;
    delayMs?: number;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Sin mensajes" }, { status: 400 });
  }

  try {
    const res = await fetch(`${WA_URL}/send-bulk/${profile.clinicId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, delayMs }),
      signal: AbortSignal.timeout(290_000),
    });
    const body = await res.json();
    return NextResponse.json(body, { status: res.status });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 503 });
  }
}
