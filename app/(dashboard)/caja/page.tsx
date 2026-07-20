import { createClient } from "@/lib/supabase/server";
import { requireNavAccess } from "@/lib/guard";
import { getProfile } from "@/lib/auth";
import { getClinicFeatures, getClinicCurrency } from "@/lib/superadmin";
import { money, boliviaTodayISO } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { AgentPerformance } from "@/components/dashboard/AgentPerformance";
import {
  RevenueChart,
  type DailyPoint,
  type MonthlyPoint,
} from "@/components/dashboard/RevenueChart";
import { TopTreatmentsChart, type Treatment } from "@/components/dashboard/TopTreatmentsChart";
import { TopDoctorsChart, type DoctorStat } from "@/components/dashboard/TopDoctorsChart";
import { PatientsChart, type DailyPoint as PatDaily, type MonthlyPoint as PatMonthly } from "@/components/dashboard/PatientsChart";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default async function FinanceDashboardPage() {
  await requireNavAccess("caja");
  const supabase = await createClient();
  const [features, profile, currency] = await Promise.all([
    getClinicFeatures(),
    getProfile(),
    getClinicCurrency(),
  ]);

  const [by, bm, bd] = boliviaTodayISO().split("-").map(Number);
  const now = new Date(by, bm - 1, bd);
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstPrevMonth = new Date(year, month - 1, 1);
  const tomorrow = new Date(year, month, now.getDate() + 1);
  const yearStart = new Date(year, 0, 1);
  const firstThisMonth = new Date(year, month, 1);

  const dow = (now.getDay() + 6) % 7;
  const monThis = new Date(now);
  monThis.setDate(now.getDate() - dow);
  const monLast = new Date(monThis);
  monLast.setDate(monThis.getDate() - 7);
  const sunLast = new Date(monThis);
  sunLast.setDate(monThis.getDate() - 1);

  const queryStart = monThis < firstThisMonth ? monThis : firstThisMonth;
  const dataStart = new Date(Math.min(yearStart.getTime(), firstPrevMonth.getTime(), queryStart.getTime()));

  const [{ data: dailyRaw }, { data: monthlyRaw }, { data: topRaw }, { data: apptsRaw }, { data: worksRaw }, { data: allPayments }, { data: allPlans }, { count: newPatCount }] = await Promise.all([
    supabase.rpc("dash_revenue_by_day", {
      p_from: firstPrevMonth.toISOString(),
      p_to: tomorrow.toISOString(),
    }),
    supabase.rpc("dash_revenue_by_month", { p_year: year }),
    supabase.rpc("dash_top_treatments", {
      p_from: yearStart.toISOString(),
      p_to: tomorrow.toISOString(),
      p_limit: 8,
    }),
    supabase
      .from("appointments")
      .select("dentist_name, patient_id, starts_at, status")
      .gte("starts_at", dataStart.toISOString())
      .lt("starts_at", tomorrow.toISOString()),
    supabase
      .from("doctor_works")
      .select("patient_id, commission_amount, performed_at, doctor:profiles!doctor_works_doctor_id_fkey(full_name)")
      .gte("performed_at", dataStart.toISOString().split("T")[0]),
    supabase
      .from("payments")
      .select("patient_id, amount"),
    supabase
      .from("treatment_plans")
      .select("patient_id, treatment_phases(treatment_items(price))"),
    supabase
      .from("patients")
      .select("id", { count: "exact" })
      .gte("created_at", firstThisMonth.toISOString())
  ]);

  const dayMap = new Map<string, number>();
  for (const r of (dailyRaw ?? []) as { day: string; total: number }[]) {
    dayMap.set(r.day, Number(r.total));
  }
  const sumRange = (from: Date, toIncl: Date) => {
    let s = 0;
    const d = new Date(from);
    while (d <= toIncl) {
      s += dayMap.get(keyOf(d)) ?? 0;
      d.setDate(d.getDate() + 1);
    }
    return s;
  };

  const today = dayMap.get(keyOf(now)) ?? 0;
  const thisWeek = sumRange(monThis, now);
  const lastWeek = sumRange(monLast, sunLast);
  const lastDayPrevMonth = new Date(year, month, 0);
  const thisMonth = sumRange(firstThisMonth, now);
  const lastMonth = sumRange(firstPrevMonth, lastDayPrevMonth);

  const daily: DailyPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    daily.push({ label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, total: dayMap.get(keyOf(d)) ?? 0 });
  }

  const mMap = new Map<number, { total: number; patients: number }>();
  for (const r of (monthlyRaw ?? []) as { month: number; total: number; patients: number }[]) {
    mMap.set(Number(r.month), { total: Number(r.total), patients: Number(r.patients) });
  }
  const monthly: MonthlyPoint[] = MONTHS.map((name, idx) => {
    const e = mMap.get(idx + 1);
    return { name, total: e?.total ?? 0, patients: e?.patients ?? 0 };
  });
  const peak = monthly.reduce<MonthlyPoint | null>(
    (best, m) => (m.total > (best?.total ?? 0) ? m : best),
    null,
  );
  const peakMonth = peak && peak.total > 0 ? peak.name : null;

  const top: Treatment[] = ((topRaw ?? []) as Treatment[]).map((r) => ({
    label: r.label,
    cnt: Number(r.cnt),
    revenue: Number(r.revenue),
  }));

  const doctorStats = new Map<string, { patients: Set<string>; commission: number }>();
  const patientsToday = new Set<string>();
  const patientsThisWeek = new Set<string>();
  const patientsThisMonth = new Set<string>();
  const dailyPatMap = new Map<string, Set<string>>();
  const monthlyPatMap = new Map<number, Set<string>>();

  const trackPatient = (dateIso: string, pid: string | null) => {
    const id = pid ?? Math.random().toString();
    const d = new Date(dateIso);
    const dayK = keyOf(d);
    const moK = d.getMonth() + 1;

    if (!dailyPatMap.has(dayK)) dailyPatMap.set(dayK, new Set());
    dailyPatMap.get(dayK)!.add(id);

    if (d.getFullYear() === year) {
      if (!monthlyPatMap.has(moK)) monthlyPatMap.set(moK, new Set());
      monthlyPatMap.get(moK)!.add(id);
    }

    if (d >= now && d < tomorrow) patientsToday.add(id);
    if (d >= monThis && d < tomorrow) patientsThisWeek.add(id);
    if (d >= firstThisMonth && d < tomorrow) patientsThisMonth.add(id);
    return id;
  };

  let monthApptsTotal = 0;
  let monthApptsNoShow = 0;

  for (const a of apptsRaw ?? []) {
    const isThisMonth = new Date(a.starts_at) >= firstThisMonth;
    if (isThisMonth) {
      monthApptsTotal++;
      if (a.status === "no_show") monthApptsNoShow++;
    }

    if (a.status === "finished") {
      const id = trackPatient(a.starts_at, a.patient_id);
      if (!a.dentist_name) continue;
      let s = doctorStats.get(a.dentist_name);
      if (!s) { s = { patients: new Set(), commission: 0 }; doctorStats.set(a.dentist_name, s); }
      if (isThisMonth) s.patients.add(id);
    }
  }

  let totalMonthCommissions = 0;
  for (const w of worksRaw ?? []) {
    const id = trackPatient(w.performed_at + "T12:00:00Z", w.patient_id);
    const name = (w.doctor as { full_name?: string } | null)?.full_name;
    if (!name) continue;
    const comm = Number(w.commission_amount);

    if (new Date(w.performed_at + "T12:00:00Z") >= firstThisMonth) {
      totalMonthCommissions += comm;
      let s = doctorStats.get(name);
      if (!s) { s = { patients: new Set(), commission: 0 }; doctorStats.set(name, s); }
      s.commission += comm;
      s.patients.add(id);
    }
  }

  const topDoctors: DoctorStat[] = Array.from(doctorStats.entries())
    .map(([name, stat]) => ({ name, patientsCount: stat.patients.size, commission: stat.commission }))
    .sort((a, b) => b.patientsCount - a.patientsCount);

  const patDaily: PatDaily[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const k = keyOf(d);
    patDaily.push({ label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, count: dailyPatMap.get(k)?.size ?? 0 });
  }

  const patMonthly: PatMonthly[] = MONTHS.map((name, idx) => {
    return { name, count: monthlyPatMap.get(idx + 1)?.size ?? 0 };
  });

  const patPeak = patMonthly.reduce<PatMonthly | null>(
    (best, m) => (m.count > (best?.count ?? 0) ? m : best),
    null,
  );
  const patPeakMonth = patPeak && patPeak.count > 0 ? patPeak.name : null;

  const paidByPatient = new Map<string, number>();
  for (const p of allPayments ?? []) {
    if (!p.patient_id) continue;
    paidByPatient.set(p.patient_id, (paidByPatient.get(p.patient_id) ?? 0) + Number(p.amount));
  }
  const quotedByPatient = new Map<string, number>();
  for (const plan of allPlans ?? []) {
    const pid = plan.patient_id as string;
    const phases = (plan.treatment_phases as { treatment_items: { price: number }[] }[] | null) ?? [];
    const total = phases.flatMap((ph) => ph.treatment_items ?? []).reduce((s, i) => s + Number(i.price), 0);
    quotedByPatient.set(pid, (quotedByPatient.get(pid) ?? 0) + total);
  }
  let totalDebt = 0;
  let debtPatients = 0;
  for (const [patId, quoted] of quotedByPatient) {
    const paid = paidByPatient.get(patId) ?? 0;
    const debt = quoted - paid;
    if (debt > 0) { debtPatients++; totalDebt += debt; }
  }
  const noShowRate = monthApptsTotal > 0 ? (monthApptsNoShow / monthApptsTotal) * 100 : 0;

  // Desempeño del Asistente Virtual (agente de IA por WhatsApp). Se mide por la
  // columna appointments.source = 'agente' (citas que agendó) y
  // anamnesis_invitations.source = 'agente' (registros de pacientes que trajo).
  // Solo se calcula si la clínica tiene el addon encendido. Los rangos de "hoy"
  // y "este mes" se anclan a hora Bolivia (UTC-4), no al UTC del servidor.
  let agentStats:
    | null
    | {
        bookedToday: number;
        bookedMonth: number;
        bookedTotal: number;
        intakesTotal: number;
        intakesApproved: number;
        intakesPending: number;
      } = null;

  if (features.agente_ia && profile?.clinicId) {
    const clinicId = profile.clinicId;
    const todayISO = boliviaTodayISO();
    const bDayStart = new Date(`${todayISO}T00:00:00-04:00`).toISOString();
    const bMonthStart = new Date(
      `${todayISO.slice(0, 7)}-01T00:00:00-04:00`,
    ).toISOString();

    const [bookedTodayRes, bookedMonthRes, bookedTotalRes, intakeRes] =
      await Promise.all([
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", clinicId)
          .eq("source", "agente")
          .gte("created_at", bDayStart),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", clinicId)
          .eq("source", "agente")
          .gte("created_at", bMonthStart),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("clinic_id", clinicId)
          .eq("source", "agente"),
        supabase
          .from("anamnesis_invitations")
          .select("reviewed_at, review_action")
          .eq("clinic_id", clinicId)
          .eq("source", "agente"),
      ]);

    const intakes = (intakeRes.data ?? []) as {
      reviewed_at: string | null;
      review_action: string | null;
    }[];

    agentStats = {
      bookedToday: bookedTodayRes.count ?? 0,
      bookedMonth: bookedMonthRes.count ?? 0,
      bookedTotal: bookedTotalRes.count ?? 0,
      intakesTotal: intakes.length,
      intakesApproved: intakes.filter((i) => i.review_action === "applied")
        .length,
      intakesPending: intakes.filter((i) => !i.reviewed_at).length,
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        subtitle="Demanda de servicios e ingresos en el tiempo."
      />

      {agentStats && <AgentPerformance stats={agentStats} />}

      {/* Insights & Alertas */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InsightCard
          title="Cuentas por Cobrar"
          value={money(totalDebt, currency)}
          subtitle={`${debtPatients} pacientes con deuda pendiente`}
          alert={totalDebt > 0}
          icon="💸"
        />
        <InsightCard
          title="Tasa de Ausentismo (Mes)"
          value={`${noShowRate.toFixed(1)}%`}
          subtitle={`${monthApptsNoShow} citas perdidas de ${monthApptsTotal}`}
          alert={noShowRate > 15}
          icon="📉"
        />
        <InsightCard
          title="Crecimiento de Cartera"
          value={`+${newPatCount ?? 0}`}
          subtitle="Pacientes nuevos registrados este mes"
          alert={false}
          icon="🚀"
        />
      </div>

      {/* Finanzas */}
      <h2 className="mt-8 mb-4 text-lg font-semibold">Flujo de Caja y Finanzas</h2>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <KpiCard label="Ganancias de hoy" value={today} currency={currency} />
          <KpiCard label="Esta semana" value={thisWeek} prev={lastWeek} prevLabel="sem. anterior" currency={currency} />
          <KpiCard label="Este mes" value={thisMonth} prev={lastMonth} prevLabel="mes anterior" currency={currency} />
          <KpiCard label="Comisiones este mes" value={totalMonthCommissions} currency={currency} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RevenueChart daily={daily} monthly={monthly} peakMonth={peakMonth} currency={currency} />
          <TopTreatmentsChart data={top} currency={currency} />
        </div>
      </div>

      {/* Pacientes y Clínica */}
      <h2 className="mt-10 mb-4 text-lg font-semibold">Volumen y Operativa Médica</h2>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label="Pacientes hoy" value={patientsToday.size} isCurrency={false} />
          <KpiCard label="Pacientes esta semana" value={patientsThisWeek.size} isCurrency={false} />
          <KpiCard label="Pacientes este mes" value={patientsThisMonth.size} isCurrency={false} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PatientsChart daily={patDaily} monthly={patMonthly} peakMonth={patPeakMonth} />
          <TopDoctorsChart data={topDoctors} currency={currency} />
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  prev,
  prevLabel,
  isCurrency = true,
  currency,
}: {
  label: string;
  value: number;
  prev?: number;
  prevLabel?: string;
  isCurrency?: boolean;
  currency?: string;
}) {
  let delta: number | null = null;
  if (prev !== undefined && prev > 0) delta = ((value - prev) / prev) * 100;
  const up = delta !== null && delta >= 0;

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-slate-800">
        {isCurrency ? money(value, currency ?? "Bs") : value}
      </p>
      {delta !== null ? (
        <p className={`mt-1 text-xs font-medium ${up ? "text-emerald-600" : "text-red-600"}`}>
          {up ? "▲" : "▼"} {Math.abs(delta).toFixed(0)}%{" "}
          <span className="font-normal text-slate-400">vs {prevLabel}</span>
        </p>
      ) : prev !== undefined ? (
        <p className="mt-1 text-xs text-slate-400">Sin datos del período anterior</p>
      ) : null}
    </div>
  );
}

function InsightCard({
  title,
  value,
  subtitle,
  alert,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  alert: boolean;
  icon: string;
}) {
  return (
    <div className={`rounded-lg p-5 shadow-sm ring-1 flex items-start gap-4 transition-all ${alert ? "bg-red-50/50 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/30" : "bg-white ring-slate-200"}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ${alert ? "bg-red-100 dark:bg-red-500/20" : "bg-slate-100"}`}>
        {icon}
      </div>
      <div>
        <p className={`text-sm font-medium ${alert ? "text-red-800 dark:text-red-300" : "text-slate-600"}`}>{title}</p>
        <p className={`mt-0.5 text-2xl font-bold tracking-tight ${alert ? "text-red-900 dark:text-red-200" : "text-slate-800"}`}>{value}</p>
        <p className={`mt-1 text-xs ${alert ? "text-red-600 dark:text-red-400" : "text-slate-500"}`}>{subtitle}</p>
      </div>
    </div>
  );
}
