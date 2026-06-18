import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { AgendaShell, type AgendaView } from "@/components/agenda/AgendaShell";
import { RealtimeAppointments } from "@/components/agenda/RealtimeAppointments";
import { requireFeature } from "@/lib/guard";
import { getClinicFeatures } from "@/lib/superadmin";
import { boliviaTodayISO } from "@/lib/format";
import { gridRange } from "@/lib/agenda";
import { getPlatformAdminIds } from "@/lib/platformAdmins";

export const dynamic = "force-dynamic";

const isView = (v: string | undefined): v is AgendaView =>
  v === "day" || v === "week" || v === "month" || v === "overview";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  await requireFeature("agenda");
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : boliviaTodayISO();
  const view: AgendaView = isView(sp.view) ? sp.view : "month";

  // Rango = grilla de 6 semanas del mes visible, así la vista Semana en el borde
  // de mes no queda vacía.
  const { start, end } = gridRange(new Date(date + "T00:00:00"));

  const supabase = await createClient();
  const [profile, features, platformAdminIds] = await Promise.all([
    getProfile(),
    getClinicFeatures(),
    getPlatformAdminIds(),
  ]);
  const writable = can(profile?.role, "appointments:write");
  const isAdmin = profile?.role === "admin";
  const isRecepcionista = profile?.role === "recepcionista";
  // Admin y recepcionista pueden ver y filtrar la agenda de todos los doctores.
  const canViewAll = isAdmin || isRecepcionista;

  // Nombre del usuario logueado (para preseleccionar "Mi Agenda" en el dropdown).
  const myName = profile?.fullName ?? "";

  // Query base de citas del rango visible.
  let apptsQuery = supabase
    .from("appointments")
    .select(
      "id, starts_at, ends_at, status, dentist_name, patient_name, patient_id, reason, consult_price, deposit, deposit_method, patients(full_name, national_id)",
    )
    .gte("starts_at", start.toISOString())
    .lt("starts_at", end.toISOString())
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });

  // Solo doctores ven únicamente sus citas; admin y recepcionista ven todas.
  if (!canViewAll && myName) {
    apptsQuery = apptsQuery.eq("dentist_name", myName);
  }

  // Query de odontólogos (dropdown de admin y recepcionista), excluyendo
  // superadmins y usuarios desactivados (no se asignan citas nuevas a ellos).
  let doctorsQuery = canViewAll
    ? supabase
        .from("profiles")
        .select("id, full_name")
        .in("role", ["odontologo_general", "especialista", "admin"])
        .eq("active", true)
        .order("full_name")
    : null;
  if (doctorsQuery && platformAdminIds.length > 0) {
    doctorsQuery = doctorsQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }

  // Odontólogos y especialistas solo ven sus propios pacientes en el picker.
  const isDoctor =
    profile?.role === "odontologo_general" || profile?.role === "especialista";
  let patientsQuery = supabase
    .from("patients")
    .select("id, full_name, national_id")
    .order("full_name");
  if (isDoctor && profile) {
    const [{ data: apptP }, { data: workP }] = await Promise.all([
      supabase
        .from("appointments")
        .select("patient_id")
        .eq("dentist_name", profile.fullName)
        .not("patient_id", "is", null),
      supabase
        .from("doctor_works")
        .select("patient_id")
        .eq("doctor_id", profile.userId)
        .not("patient_id", "is", null),
    ]);
    const ids = [
      ...new Set([
        ...(apptP ?? []).map((r) => r.patient_id as string),
        ...(workP ?? []).map((r) => r.patient_id as string),
      ]),
    ];
    patientsQuery =
      ids.length > 0
        ? patientsQuery.in("id", ids)
        : patientsQuery.in("id", ["00000000-0000-0000-0000-000000000000"]);
  }

  const [{ data: appts }, { data: patients }, { data: doctorsRaw }] = await Promise.all([
    apptsQuery,
    patientsQuery,
    doctorsQuery ?? Promise.resolve({ data: [] }),
  ]);

  // Doctores que ve el modal para el campo "Odontólogo".
  // Admin/recepcionista: lista completa. Doctor: solo él mismo, así el
  // modal muestra un select preseleccionado con su nombre exacto y el
  // valor guardado en dentist_name siempre coincide con profile.full_name.
  const doctors = canViewAll
    ? (doctorsRaw ?? [])
    : profile
    ? [{ id: profile.userId, full_name: profile.fullName }]
    : [];

  return (
    <div className="space-y-6">
      <RealtimeAppointments />
      <h1 className="text-2xl font-bold">Agenda</h1>
      <AgendaShell
        patients={patients ?? []}
        appts={(appts as never) ?? []}
        date={date}
        view={view}
        canWrite={writable}
        doctors={doctors ?? []}
        isAdmin={canViewAll}
        myName={myName}
        whatsappEnabled={features.whatsapp}
        whatsappManualEnabled={features.whatsapp_manual}
      />
    </div>
  );
}
