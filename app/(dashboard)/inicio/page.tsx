import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Stethoscope,
  Wallet,
  UserPlus,
  ArrowRight,
} from "lucide-react";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isReceptionistLike } from "@/lib/rbac";
import { boliviaTodayISO, BOLIVIA_TZ, bs, fmtBoliviaTime } from "@/lib/format";

export const dynamic = "force-dynamic";

type TodayAppt = {
  id: string;
  starts_at: string;
  status: string;
  dentist_name: string | null;
  patient_name: string | null;
  patients: { full_name: string | null } | null;
};

function greeting(): string {
  const hour = Number(
    new Date().toLocaleString("en-US", {
      timeZone: BOLIVIA_TZ,
      hour: "2-digit",
      hour12: false,
    }),
  );
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export default async function InicioPage() {
  const profile = await getProfile();
  if (!profile) return null;

  const canViewAll =
    profile.role === "admin" || isReceptionistLike(profile.role);

  const supabase = await createClient();

  // Rango del día y del mes en hora Bolivia (UTC-4) como instantes UTC.
  const todayISO = boliviaTodayISO();
  const dayStart = new Date(`${todayISO}T00:00:00-04:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const monthStart = new Date(`${todayISO.slice(0, 7)}-01T00:00:00-04:00`);

  // Citas de hoy (doctores/colegas ven solo las suyas).
  let apptQuery = supabase
    .from("appointments")
    .select(
      "id, starts_at, status, dentist_name, patient_name, patients(full_name)",
    )
    .eq("clinic_id", profile.clinicId)
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .neq("status", "cancelled")
    .order("starts_at", { ascending: true });
  if (!canViewAll) apptQuery = apptQuery.eq("dentist_name", profile.fullName);

  // Ingresos del día y pacientes nuevos del mes: solo para quien ve toda la
  // clínica (admin / recepción). Los doctores no ven finanzas globales.
  const [{ data: apptData }, incomeRes, newPatientsRes] = await Promise.all([
    apptQuery,
    canViewAll
      ? supabase
          .from("payments")
          .select("amount")
          .eq("clinic_id", profile.clinicId)
          .eq("kind", "payment")
          .gte("received_at", dayStart.toISOString())
          .lt("received_at", dayEnd.toISOString())
      : Promise.resolve({ data: null }),
    canViewAll
      ? supabase
          .from("patients")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", profile.clinicId)
          .gte("created_at", monthStart.toISOString())
      : Promise.resolve({ count: null }),
  ]);

  const appts = (apptData ?? []) as unknown as TodayAppt[];
  const total = appts.length;
  const confirmed = appts.filter((a) => a.status === "confirmed").length;
  const pending = appts.filter((a) => a.status === "scheduled").length;
  const attended = appts.filter((a) => a.status === "finished").length;

  const income = ((incomeRes.data as { amount: number }[] | null) ?? []).reduce(
    (sum, p) => sum + Number(p.amount ?? 0),
    0,
  );
  const newPatients =
    (newPatientsRes as { count: number | null }).count ?? 0;

  // Próximas citas (a partir de ahora) para el resto del día.
  const nowIso = new Date().toISOString();
  const upcoming = appts
    .filter(
      (a) => a.starts_at >= nowIso && !["finished", "cancelled"].includes(a.status),
    )
    .slice(0, 6);

  const apptName = (a: TodayAppt) =>
    a.patients?.full_name ?? a.patient_name ?? "Paciente";

  const dateLabel = dayStart.toLocaleDateString("es-BO", {
    timeZone: BOLIVIA_TZ,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const stats = [
    { label: "Citas hoy", value: total, icon: Calendar, tone: "bg-clinic/10 text-clinic-fg" },
    { label: "Confirmadas", value: confirmed, icon: CheckCircle2, tone: "bg-sky-50 text-sky-600 dark:bg-sky-500/10" },
    { label: "Por confirmar", value: pending, icon: Clock, tone: "bg-amber-50 text-amber-600 dark:bg-amber-500/10" },
    { label: "Atendidas", value: attended, icon: Stethoscope, tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">
          {greeting()}
          {profile.fullName ? `, ${profile.fullName.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm capitalize text-slate-500">{dateLabel}</p>
      </div>

      {/* Métricas de citas */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.tone}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-2xl font-bold leading-none">{s.value}</div>
              <div className="mt-1 truncate text-xs text-slate-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Finanzas / pacientes (solo admin y recepción) */}
      {canViewAll && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
              <Wallet className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-2xl font-bold leading-none">{bs(income)}</div>
              <div className="mt-1 truncate text-xs text-slate-500">Ingresos de hoy</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-clinic/10 text-clinic-fg">
              <UserPlus className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-2xl font-bold leading-none">{newPatients}</div>
              <div className="mt-1 truncate text-xs text-slate-500">Pacientes nuevos este mes</div>
            </div>
          </div>
        </div>
      )}

      {/* Próximas citas de hoy */}
      <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="font-semibold text-slate-800">Próximas citas de hoy</h2>
          <Link
            href={`/agenda?date=${todayISO}&view=day`}
            className="flex items-center gap-1 text-sm font-medium text-clinic hover:text-clinic-fg"
          >
            Ver agenda <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            No quedan citas pendientes para hoy.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3">
                <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-slate-500">
                  {fmtBoliviaTime(a.starts_at)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">
                    {apptName(a)}
                  </div>
                  {a.dentist_name && (
                    <div className="truncate text-xs text-slate-400">
                      {a.dentist_name}
                    </div>
                  )}
                </div>
                {a.status === "confirmed" && (
                  <span className="shrink-0 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-600 dark:bg-sky-500/10">
                    Confirmada
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
