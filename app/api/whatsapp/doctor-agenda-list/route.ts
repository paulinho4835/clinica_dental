import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getClinicFeatures } from "@/lib/superadmin";

// Devuelve, por cada doctor con teléfono registrado y al menos una cita en el
// día pedido, su lista de citas. Alimenta el modal de "Avisar a doctores", que
// abre WhatsApp Web (wa.me) con el resumen prellenado (addon "aviso_doctores").
export async function GET(req: NextRequest) {
  const [profile, features] = await Promise.all([getProfile(), getClinicFeatures()]);
  if (!can(profile?.role, "appointments:write")) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  if (!features.aviso_doctores) {
    return NextResponse.json({ error: "Módulo Aviso a doctores no habilitado" }, { status: 403 });
  }

  const dateParam = req.nextUrl.searchParams.get("date"); // YYYY-MM-DD
  const supabase = await createClient();

  const { data: clinic } = await supabase
    .from("clinics")
    .select("name")
    .eq("id", profile!.clinicId)
    .single();

  // Rango del día seleccionado en hora Bolivia (UTC-4). Sin fecha → hoy.
  const base = dateParam
    ? new Date(`${dateParam}T00:00:00-04:00`)
    : (() => {
        const y = new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
        return new Date(`${y}T00:00:00-04:00`);
      })();
  const dayStart = base.toISOString();
  const dayEnd = new Date(base.getTime() + 24 * 60 * 60_000).toISOString();

  const [{ data: appts, error }, { data: docs }] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, starts_at, dentist_name, reason, patient_name, patients(full_name)")
      .eq("clinic_id", profile!.clinicId)
      .gte("starts_at", dayStart)
      .lt("starts_at", dayEnd)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true }),
    // Teléfonos de los doctores de la clínica (solo los que lo tienen cargado).
    supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("clinic_id", profile!.clinicId)
      .eq("active", true)
      .not("phone", "is", null),
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Mapa nombre de doctor → teléfono. El match usa dentist_name como texto,
  // igual que el filtro de la agenda.
  const phoneByName = new Map<string, string>();
  for (const d of docs ?? []) {
    const name = (d.full_name ?? "").trim();
    const phone = (d.phone as string | null) ?? null;
    if (name && phone) phoneByName.set(name, phone);
  }

  // Agrupar citas por doctor.
  type Entry = {
    id: string;
    starts_at: string;
    patientName: string;
    reason: string | null;
  };
  const byDoctor = new Map<string, Entry[]>();
  for (const a of appts ?? []) {
    const name = (a.dentist_name ?? "").trim();
    if (!name) continue;
    const entry: Entry = {
      id: a.id,
      starts_at: a.starts_at,
      patientName:
        (a.patients as { full_name?: string } | null)?.full_name ??
        a.patient_name ??
        "Paciente",
      reason: a.reason ?? null,
    };
    (byDoctor.get(name) ?? byDoctor.set(name, []).get(name)!).push(entry);
  }

  // Solo doctores con teléfono Y con al menos una cita ese día.
  const doctors = [...byDoctor.entries()]
    .filter(([name]) => phoneByName.has(name))
    .map(([name, list]) => ({
      doctorName: name,
      phone: phoneByName.get(name)!,
      appts: list,
    }))
    .sort((a, b) => a.doctorName.localeCompare(b.doctorName));

  return NextResponse.json({
    clinicName: clinic?.name ?? "Clínica Dental",
    date: base.toLocaleDateString("es-BO", {
      timeZone: "America/La_Paz",
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }),
    doctors,
  });
}
