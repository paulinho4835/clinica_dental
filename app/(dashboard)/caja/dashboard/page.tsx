import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireNavAccess } from "@/lib/guard";
import { bs, boliviaTodayISO } from "@/lib/format";
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

  // "Hoy" en Bolivia: las RPC agregan por día en zona Bolivia, así que todos los
  // rangos (hoy/semana/mes) deben anclarse al día-calendario boliviano, no a UTC.
  const [by, bm, bd] = boliviaTodayISO().split("-").map(Number);
  const now = new Date(by, bm - 1, bd);
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstPrevMonth = new Date(year, month - 1, 1); // inicio rango diario
  const tomorrow = new Date(year, month, now.getDate() + 1);
  const yearStart = new Date(year, 0, 1);
  const firstThisMonth = new Date(year, month, 1);

  const dow = (now.getDay() + 6) % 7; // 0 = lunes
  const monThis = new Date(now);
  monThis.setDate(now.getDate() - dow);
  const monLast = new Date(monThis);
  monLast.setDate(monThis.getDate() - 7);
  const sunLast = new Date(monThis);
  sunLast.setDate(monThis.getDate() - 1);

  const queryStart = monThis < firstThisMonth ? monThis : firstThisMonth;
  const dataStart = new Date(Math.min(yearStart.getTime(), firstPrevMonth.getTime(), queryStart.getTime()));

  // ── Consultas de agregación (RPC SQL · respetan RLS por clínica) ──
  const [{ data: dailyRaw }, { data: monthlyRaw }, { data: topRaw }, { data: apptsRaw }, { data: worksRaw }, { data: debtRaw }, { count: newPatCount }] = await Promise.all([
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
      .from("patients")
      .select("balance")
      .lt("balance", 0),
    supabase
      .from("patients")
      .select("id", { count: "exact" })
      .gte("created_at", firstThisMonth.toISOString())
  ]);

  // ── Mapa día→total para KPIs y serie diaria ──
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

  // KPIs
  const today = dayMap.get(keyOf(now)) ?? 0;

  const thisWeek = sumRange(monThis, now);
  const lastWeek = sumRange(monLast, sunLast);

  const lastDayPrevMonth = new Date(year, month, 0);
  const thisMonth = sumRange(firstThisMonth, now);
  const lastMonth = sumRange(firstPrevMonth, lastDayPrevMonth);

  // Serie diaria (últimos 30 días, con huecos en 0)
  const daily: DailyPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    daily.push({ label: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`, total: dayMap.get(keyOf(d)) ?? 0 });
  }

  // Serie mensual (12 meses) + detección de pico
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

  // ── Estadísticas por Doctor y Listas de Pacientes ──
  const doctorStats = new Map<string, { patients: Set<string>; commission: number }>();
  
  const patientsToday = new Set<string>();
  const patientsThisWeek = new Set<string>();
  const patientsThisMonth = new Set<string>();

  // Mapas para los gráficos de pacientes
  const dailyPatMap = new Map<string, Set<string>>();
  const monthlyPatMap = new Map<number, Set<string>>();

  const trackPatient = (dateIso: string, pid: string | null) => {
    const id = pid ?? Math.random().toString();
    const d = new Date(dateIso);
    const dayK = keyOf(d);
    const moK = d.getMonth() + 1; // 1-12
    
    // Gráficos (solo año actual para meses, y cualquier fecha para diarios)
    if (!dailyPatMap.has(dayK)) dailyPatMap.set(dayK, new Set());
    dailyPatMap.get(dayK)!.add(id);
    
    if (d.getFullYear() === year) {
      if (!monthlyPatMap.has(moK)) monthlyPatMap.set(moK, new Set());
      monthlyPatMap.get(moK)!.add(id);
    }

    // KPIs
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
    const id = trackPatient(w.performed_at + "T12:00:00Z", w.patient_id); // pseudo-time for date
    const name = (w.doctor as { full_name?: string } | null)?.full_name;
    if (!name) continue;
    const comm = Number(w.commission_amount);
    
    // Only add to month commissions and doctor month stats if it falls within this month
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

  // Preparamos datos para PatientsChart
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

  // ── Inteligencia de Negocio (Insights) ──
  const totalDebt = debtRaw?.reduce((s, p) => s + Math.abs(Number(p.balance)), 0) ?? 0;
  const debtPatients = debtRaw?.length ?? 0;
  const noShowRate = monthApptsTotal > 0 ? (monthApptsNoShow / monthApptsTotal) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard de finanzas</h1>
          <p className="text-sm text-slate-400">Demanda de servicios e ingresos en el tiempo.</p>
        </div>
        <Link
          href="/caja"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
        >
          ← Volver a caja
        </Link>
      </div>

      {/* ── Insights & Alertas (WOW Features) ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <InsightCard 
          title="Cuentas por Cobrar" 
          value={bs(totalDebt)} 
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

      {/* ── Sección: Finanzas ── */}
      <h2 className="text-lg font-semibold mt-8 mb-4">Flujo de Caja y Finanzas</h2>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <KpiCard label="Ganancias de hoy" value={today} />
          <KpiCard label="Esta semana" value={thisWeek} prev={lastWeek} prevLabel="sem. anterior" />
          <KpiCard label="Este mes" value={thisMonth} prev={lastMonth} prevLabel="mes anterior" />
          <KpiCard label="Comisiones este mes" value={totalMonthCommissions} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RevenueChart daily={daily} monthly={monthly} peakMonth={peakMonth} />
          <TopTreatmentsChart data={top} />
        </div>
      </div>

      {/* ── Sección: Pacientes y Clínica ── */}
      <h2 className="text-lg font-semibold mt-10 mb-4">Volumen y Operativa Médica</h2>
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label="Pacientes hoy" value={patientsToday.size} isCurrency={false} />
          <KpiCard label="Pacientes esta semana" value={patientsThisWeek.size} isCurrency={false} />
          <KpiCard label="Pacientes este mes" value={patientsThisMonth.size} isCurrency={false} />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <PatientsChart daily={patDaily} monthly={patMonthly} peakMonth={patPeakMonth} />
          <TopDoctorsChart data={topDoctors} />
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta KPI con comparativa opcional ────────────────────────────────────
function KpiCard({
  label,
  value,
  prev,
  prevLabel,
  isCurrency = true,
}: {
  label: string;
  value: number;
  prev?: number;
  prevLabel?: string;
  isCurrency?: boolean;
}) {
  // Variación % vs período anterior.
  let delta: number | null = null;
  if (prev !== undefined && prev > 0) delta = ((value - prev) / prev) * 100;
  const up = delta !== null && delta >= 0;

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-slate-800">
        {isCurrency ? bs(value) : value}
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

// ─── Tarjeta Insight de Negocio ──────────────────────────────────────────────
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
    <div className={`rounded-lg p-5 shadow-sm ring-1 flex items-start gap-4 transition-all ${alert ? "bg-red-50/50 ring-red-200" : "bg-white ring-slate-200"}`}>
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl ${alert ? "bg-red-100" : "bg-slate-100"}`}>
        {icon}
      </div>
      <div>
        <p className={`text-sm font-medium ${alert ? "text-red-800" : "text-slate-600"}`}>{title}</p>
        <p className={`mt-0.5 text-2xl font-bold tracking-tight ${alert ? "text-red-900" : "text-slate-800"}`}>{value}</p>
        <p className={`mt-1 text-xs ${alert ? "text-red-600" : "text-slate-500"}`}>{subtitle}</p>
      </div>
    </div>
  );
}
