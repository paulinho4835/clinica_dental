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

  // ── Consultas de agregación (RPC SQL · respetan RLS por clínica) ──
  const [{ data: dailyRaw }, { data: monthlyRaw }, { data: topRaw }] = await Promise.all([
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

  const dow = (now.getDay() + 6) % 7; // 0 = lunes
  const monThis = new Date(now);
  monThis.setDate(now.getDate() - dow);
  const monLast = new Date(monThis);
  monLast.setDate(monThis.getDate() - 7);
  const sunLast = new Date(monThis);
  sunLast.setDate(monThis.getDate() - 1);
  const thisWeek = sumRange(monThis, now);
  const lastWeek = sumRange(monLast, sunLast);

  const firstThisMonth = new Date(year, month, 1);
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

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Ganancias de hoy" value={today} />
        <KpiCard label="Esta semana" value={thisWeek} prev={lastWeek} prevLabel="sem. anterior" />
        <KpiCard label="Este mes" value={thisMonth} prev={lastMonth} prevLabel="mes anterior" />
      </div>

      {/* ── Gráficos ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RevenueChart daily={daily} monthly={monthly} peakMonth={peakMonth} />
        <TopTreatmentsChart data={top} />
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
}: {
  label: string;
  value: number;
  prev?: number;
  prevLabel?: string;
}) {
  // Variación % vs período anterior.
  let delta: number | null = null;
  if (prev !== undefined && prev > 0) delta = ((value - prev) / prev) * 100;
  const up = delta !== null && delta >= 0;

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-slate-800">{bs(value)}</p>
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
