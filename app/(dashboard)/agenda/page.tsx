import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can, isReceptionistLike } from "@/lib/rbac";
import { AgendaShell, type AgendaView } from "@/components/agenda/AgendaShell";
import { RealtimeAppointments } from "@/components/agenda/RealtimeAppointments";
import { requireFeature } from "@/lib/guard";
import { getClinicFeatures, getClinicCurrency } from "@/lib/superadmin";
import { boliviaTodayISO } from "@/lib/format";
import { gridRange } from "@/lib/agenda";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { mapAvailabilityRow, type AvailabilityBlock } from "@/lib/availability";

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
  const [profile, features, platformAdminIds, currency] = await Promise.all([
    getProfile(),
    getClinicFeatures(),
    getPlatformAdminIds(),
    getClinicCurrency(),
  ]);
  const writable = can(profile?.role, "appointments:write");
  const isAdmin = profile?.role === "admin";
  const isRecepcionista = isReceptionistLike(profile?.role);
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

  // Aislamiento por clínica EXPLÍCITO (defensa en profundidad): refuerza la RLS
  // para que la agenda nunca muestre citas de otra clínica.
  if (profile) {
    apptsQuery = apptsQuery.eq("clinic_id", profile.clinicId);
  }

  // Solo doctores ven únicamente sus citas; admin y recepcionista ven todas.
  if (!canViewAll && myName) {
    apptsQuery = apptsQuery.eq("dentist_name", myName);
  }

  // Query de odontólogos (dropdown de admin y recepcionista), excluyendo
  // superadmins y usuarios desactivados (no se asignan citas nuevas a ellos).
  // "admin" se incluye porque en clínicas chicas el dueño suele atender
  // pacientes además de administrar (mismo criterio que cuentas/page.tsx y
  // COMMISSION_ROLES en lib/pagos.ts) — si no, el admin no puede agendarse a
  // sí mismo ni aparece en el filtro "Mi Agenda".
  let doctorsQuery = canViewAll && profile
    ? supabase
        .from("profiles")
        .select("id, full_name")
        .in("role", ["odontologo_general", "especialista", "colega", "admin"])
        .eq("clinic_id", profile.clinicId)
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
  if (profile) {
    patientsQuery = patientsQuery.eq("clinic_id", profile.clinicId);
  }
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

  // Bloques de no disponibilidad (addon "disponibilidad"): TODOS los semanales
  // (aplican a cualquier semana) + los por fecha que tocan el rango visible.
  let availability: AvailabilityBlock[] = [];
  if (features.disponibilidad && profile) {
    const startISO = start.toISOString().slice(0, 10);
    const endISO = end.toISOString().slice(0, 10);
    const { data: availRows, error: availError } = await supabase
      .from("doctor_availability")
      .select(
        "id, dentist_id, weekday, date_from, date_to, start_time, end_time, reason, profiles!doctor_availability_dentist_id_fkey(full_name)",
      )
      .eq("clinic_id", profile.clinicId)
      .or(`weekday.not.is.null,and(date_from.lte.${endISO},date_to.gte.${startISO})`);
    if (availError) console.error("[agenda] doctor_availability fetch error:", availError);
    availability = (availRows ?? []).map(mapAvailabilityRow);
  }

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
        recordatoriosEnabled={features.recordatorios}
        whatsappManualEnabled={features.whatsapp_manual}
        avisoDoctoresEnabled={features.aviso_doctores}
        disponibilidadEnabled={features.disponibilidad}
        availability={availability}
        currency={currency}
      />
    </div>
  );
}
