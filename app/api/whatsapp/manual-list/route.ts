import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getClinicFeatures } from "@/lib/superadmin";

export async function GET(req: NextRequest) {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
  if (!can(profile?.role, "appointments:write")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  if (!features.whatsapp_manual) {
    return NextResponse.json({ error: "Módulo WhatsApp Manual no habilitado" }, { status: 403 });
  }

  const dateParam = req.nextUrl.searchParams.get("date"); // YYYY-MM-DD
  const supabase = await createClient();

  // Nombre de la clínica para el mensaje
  const { data: clinic } = await supabase
    .from("clinics")
    .select("name")
    .eq("id", profile!.clinicId)
    .single();

  // Rango del día seleccionado en hora Bolivia (UTC-4)
  const base = dateParam ? new Date(`${dateParam}T00:00:00-04:00`) : (() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    // Normalizar a medianoche Bolivia
    const y = t.toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
    return new Date(`${y}T00:00:00-04:00`);
  })();
  const dayStart = base.toISOString();
  const dayEnd = new Date(base.getTime() + 24 * 60 * 60_000).toISOString();

  const { data: appts, error } = await supabase
    .from("appointments")
    .select(
      "id, starts_at, ends_at, dentist_name, reason, patient_name, patient_id, confirm_token, patients(full_name, phone)"
    )
    .eq("clinic_id", profile!.clinicId)
    .gte("starts_at", dayStart)
    .lt("starts_at", dayEnd)
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    clinicName: clinic?.name ?? "Clínica Dental",
    date: base.toLocaleDateString("es-BO", {
      timeZone: "America/La_Paz",
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    appts: (appts ?? []).map((a) => ({
      id: a.id,
      starts_at: a.starts_at,
      patientName: (a.patients as { full_name?: string } | null)?.full_name ?? a.patient_name ?? "Paciente",
      phone: (a.patients as { phone?: string } | null)?.phone ?? null,
      dentistName: a.dentist_name ?? null,
      reason: a.reason ?? null,
      confirmToken: (a as { confirm_token?: string | null }).confirm_token ?? null,
    })),
  });
}
